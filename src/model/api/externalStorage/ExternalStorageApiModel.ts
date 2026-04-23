import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import * as apid from '../../../../api';
import IRecordedDB from '../../db/IRecordedDB';
import IVideoFileDB from '../../db/IVideoFileDB';
import IConfigFile, { ExternalStorageInfo } from '../../IConfigFile';
import IConfiguration from '../../IConfiguration';
import ILogger from '../../ILogger';
import ILoggerModel from '../../ILoggerModel';
import IExternalStorageApiModel from './IExternalStorageApiModel';

@injectable()
export default class ExternalStorageApiModel implements IExternalStorageApiModel {
    private log: ILogger;
    private config: IConfigFile;
    private recordedDB: IRecordedDB;
    private videoFileDB: IVideoFileDB;

    constructor(
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IConfiguration') configuration: IConfiguration,
        @inject('IRecordedDB') recordedDB: IRecordedDB,
        @inject('IVideoFileDB') videoFileDB: IVideoFileDB,
    ) {
        this.log = logger.getLogger();
        this.config = configuration.getConfig();
        this.recordedDB = recordedDB;
        this.videoFileDB = videoFileDB;
    }

    /**
     * storage 名から設定を取得、なければ ExternalStorageNotFound を throw
     */
    private resolveStorage(storageName: string): ExternalStorageInfo {
        const storages = this.config.externalStorage ?? [];
        const storage = storages.find(s => s.name === storageName);
        if (typeof storage === 'undefined') {
            throw new Error('ExternalStorageNotFound');
        }
        return storage;
    }

    /**
     * subPath が .. を含まない、storage ルート配下に閉じていることを保証する
     */
    private normalizeSubPath(subPath: string): string {
        const normalized = (subPath ?? '').replace(/^\/+|\/+$/g, '');
        if (normalized.split('/').some(p => p === '..' || p === '.')) {
            throw new Error('InvalidSubPath');
        }
        return normalized;
    }

    /**
     * 設定された外部ストレージの一覧を返す
     */
    public getList(): apid.ExternalStorageList {
        const items: apid.ExternalStorageItem[] = (this.config.externalStorage ?? []).map(s => {
            return { name: s.name, path: s.path };
        });
        return { items };
    }

    /**
     * 外部ストレージの指定サブパス配下のファイル/ディレクトリ一覧を返す
     */
    public async getFiles(storageName: string, subPath: string): Promise<apid.ExternalStorageFileList> {
        const storage = this.resolveStorage(storageName);
        const normalizedSub = this.normalizeSubPath(subPath);

        const targetDir = normalizedSub.length > 0 ? path.join(storage.path, normalizedSub) : storage.path;

        // path traversal の最終ガード: targetDir が storage.path 配下であること
        const resolvedTarget = path.resolve(targetDir);
        const resolvedRoot = path.resolve(storage.path);
        if (resolvedTarget !== resolvedRoot && !resolvedTarget.startsWith(resolvedRoot + path.sep)) {
            throw new Error('InvalidSubPath');
        }

        const entries = await fs.promises.readdir(resolvedTarget, { withFileTypes: true });
        const items: apid.ExternalStorageFileEntry[] = [];
        for (const e of entries) {
            const fullPath = path.join(resolvedTarget, e.name);
            const type: 'file' | 'dir' | 'other' = e.isDirectory() ? 'dir' : e.isFile() ? 'file' : 'other';
            if (type === 'other') {
                continue;
            }
            let size = 0;
            let mtime = 0;
            try {
                const st = await fs.promises.stat(fullPath);
                size = Number(st.size);
                mtime = st.mtimeMs;
            } catch {
                // stat 失敗は無視して 0 のまま返す
            }
            items.push({ name: e.name, type, size, mtime });
        }

        // dir を先頭、name 昇順でソート
        items.sort((a, b) => {
            if (a.type !== b.type) {
                return a.type === 'dir' ? -1 : 1;
            }
            return a.name.localeCompare(b.name);
        });

        // 現在ディレクトリに移動された Recorded を列挙
        const recordeds = await this.recordedDB.findByExternalPath(resolvedTarget);
        const related: apid.ExternalStorageRelatedRecorded[] = recordeds.map(r => {
            const thumbs = r.thumbnails ?? [];
            return {
                id: r.id,
                name: r.name,
                thumbnailId: thumbs.length > 0 ? thumbs[0].id : undefined,
            };
        });

        // ファイル名に Recorded.name が含まれていれば紐付ける (best-effort マッチ)
        for (const item of items) {
            if (item.type !== 'file') {
                continue;
            }
            const base = item.name.replace(/\.[^.]+$/, '');
            for (const r of recordeds) {
                if (r.name.length > 0 && base.indexOf(r.name) !== -1) {
                    if (typeof item.recordedIds === 'undefined') {
                        item.recordedIds = [];
                    }
                    item.recordedIds.push(r.id);
                }
            }
        }

        return {
            storage: { name: storage.name, path: storage.path },
            subPath: normalizedSub,
            items,
            relatedRecordeds: related,
        };
    }

    /**
     * 指定エントリの basename を newName に変更する (同ディレクトリ内リネーム)
     * ファイルならば VideoFile.filePath を更新、ディレクトリならば配下の VideoFile
     * および Recorded.externalPath のプレフィックスを一括更新する
     */
    public async rename(storageName: string, subPath: string, newName: string): Promise<void> {
        const storage = this.resolveStorage(storageName);
        const normalized = this.normalizeSubPath(subPath);
        if (normalized.length === 0) {
            throw new Error('InvalidSubPath');
        }

        // newName は basename 相当のみ (path separator 不可、空/./.. 不可)
        if (
            newName.length === 0 ||
            newName.indexOf('/') !== -1 ||
            newName.indexOf('\\') !== -1 ||
            newName === '.' ||
            newName === '..'
        ) {
            throw new Error('InvalidNewName');
        }

        const oldFullPath = path.join(storage.path, normalized);
        const parentDir = path.dirname(oldFullPath);
        const newFullPath = path.join(parentDir, newName);

        // ガード: old/new ともに storage ルート配下
        const resolvedRoot = path.resolve(storage.path);
        const resolvedOld = path.resolve(oldFullPath);
        const resolvedNew = path.resolve(newFullPath);
        if (!resolvedOld.startsWith(resolvedRoot + path.sep) || !resolvedNew.startsWith(resolvedRoot + path.sep)) {
            throw new Error('InvalidSubPath');
        }

        // old 存在確認 + 型判定
        const srcStat = await fs.promises.stat(resolvedOld);
        const isDir = srcStat.isDirectory();

        // new 衝突チェック
        try {
            await fs.promises.stat(resolvedNew);
            throw new Error('DestinationAlreadyExists');
        } catch (err: any) {
            if (err.message === 'DestinationAlreadyExists') {
                throw err;
            }
            // stat 失敗 (存在しない) なら OK
        }

        await fs.promises.rename(resolvedOld, resolvedNew);
        this.log.system.info(`renamed external: ${resolvedOld} -> ${resolvedNew}`);

        // DB 反映
        const oldRel = normalized;
        const newRelParts = oldRel.split('/');
        newRelParts[newRelParts.length - 1] = newName;
        const newRel = newRelParts.join('/');

        if (isDir) {
            await this.videoFileDB.updateExternalStoragePathPrefix(storage.name, oldRel, newRel);
            await this.recordedDB.updateExternalPathPrefix(resolvedOld, resolvedNew);
        } else {
            await this.videoFileDB.updateExternalStorageFilePath(storage.name, oldRel, newRel);
        }
    }
}

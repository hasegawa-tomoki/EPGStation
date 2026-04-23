import * as fs from 'fs';
import { inject, injectable } from 'inversify';
import * as path from 'path';
import * as apid from '../../../../api';
import IRecordedDB from '../../db/IRecordedDB';
import IConfigFile from '../../IConfigFile';
import IConfiguration from '../../IConfiguration';
import IExternalStorageApiModel from './IExternalStorageApiModel';

@injectable()
export default class ExternalStorageApiModel implements IExternalStorageApiModel {
    private config: IConfigFile;
    private recordedDB: IRecordedDB;

    constructor(
        @inject('IConfiguration') configuration: IConfiguration,
        @inject('IRecordedDB') recordedDB: IRecordedDB,
    ) {
        this.config = configuration.getConfig();
        this.recordedDB = recordedDB;
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
        const storages = this.config.externalStorage ?? [];
        const storage = storages.find(s => s.name === storageName);
        if (typeof storage === 'undefined') {
            throw new Error('ExternalStorageNotFound');
        }

        const normalizedSub = (subPath ?? '').replace(/^\/+|\/+$/g, '');
        if (normalizedSub.split('/').some(p => p === '..' || p === '.')) {
            throw new Error('InvalidSubPath');
        }

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
}

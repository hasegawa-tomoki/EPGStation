import diskusage from 'diskusage-ng';
import { inject, injectable } from 'inversify';
import { mkdirp } from 'mkdirp';
import * as path from 'path';
import * as apid from '../../../../api';
import DropLogFile from '../../../db/entities/DropLogFile';
import Recorded from '../../../db/entities/Recorded';
import Thumbnail from '../../../db/entities/Thumbnail';
import VideoFile from '../../../db/entities/VideoFile';
import FileUtil from '../../../util/FileUtil';
import StrUtil from '../../../util/StrUtil';
import IVideoUtil from '../../api/video/IVideoUtil';
import IDropLogFileDB from '../../db/IDropLogFileDB';
import IRecordedDB from '../../db/IRecordedDB';
import IRecordedHistoryDB from '../../db/IRecordedHistoryDB';
import IThumbnailDB from '../../db/IThumbnailDB';
import IVideoFileDB from '../../db/IVideoFileDB';
import IRecordedEvent from '../../event/IRecordedEvent';
import IConfigFile from '../../IConfigFile';
import IConfiguration from '../../IConfiguration';
import ILogger from '../../ILogger';
import ILoggerModel from '../../ILoggerModel';
import IRecordingManageModel from '../recording/IRecordingManageModel';
import IRecordedManageModel, {
    AddVideoFileOption,
    MoveToExternalStorageOption,
    UploadedVideoFileOption,
} from './IRecordedManageModel';
import IRecordingUtilModel from '../recording/IRecordingUtilModel';

@injectable()
export default class RecordedManageModel implements IRecordedManageModel {
    private log: ILogger;
    private config: IConfigFile;
    private recordedDB: IRecordedDB;
    private videoFileDB: IVideoFileDB;
    private thumbnailDB: IThumbnailDB;
    private dropLogFileDB: IDropLogFileDB;
    private recordedHistoryDB: IRecordedHistoryDB;
    private recordingManageModel: IRecordingManageModel;
    private recordedEvent: IRecordedEvent;
    private videoUtil: IVideoUtil;
    private recordingUtilModel: IRecordingUtilModel;

    constructor(
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IConfiguration') configuration: IConfiguration,
        @inject('IRecordedDB') recordedDB: IRecordedDB,
        @inject('IVideoFileDB') videoFileDB: IVideoFileDB,
        @inject('IThumbnailDB') thumbnailDB: IThumbnailDB,
        @inject('IDropLogFileDB') dropLogFileDB: IDropLogFileDB,
        @inject('IRecordedHistoryDB') recordedHistoryDB: IRecordedHistoryDB,
        @inject('IRecordingManageModel')
        recordingManageModel: IRecordingManageModel,
        @inject('IRecordedEvent') recordedEvent: IRecordedEvent,
        @inject('IVideoUtil') videoUtil: IVideoUtil,
        @inject('IRecordingUtilModel') recordingUtilModel: IRecordingUtilModel,
    ) {
        this.log = logger.getLogger();
        this.config = configuration.getConfig();
        this.recordedDB = recordedDB;
        this.videoFileDB = videoFileDB;
        this.thumbnailDB = thumbnailDB;
        this.dropLogFileDB = dropLogFileDB;
        this.recordedHistoryDB = recordedHistoryDB;
        this.recordingManageModel = recordingManageModel;
        this.recordedEvent = recordedEvent;
        this.videoUtil = videoUtil;
        this.recordingUtilModel = recordingUtilModel;
    }

    /**
     * 指定した録画情報と各種ファイルを削除する
     * @param recordedId: RecordedId
     * @param isIgnoreProtection: boolean
     * @return Promise<void>
     */
    public async delete(recordedId: apid.RecordedId, isIgnoreProtection: boolean = false): Promise<void> {
        this.log.system.info(`delete recorded: ${recordedId}`);
        const recorded = await this.recordedDB.findId(recordedId);
        if (recorded === null) {
            this.log.system.warn(`${recordedId} is null`);
            throw new Error('RecordedIdIsNotFound');
        }

        // プロテクトチェック
        if (recorded.isProtected === true) {
            this.log.system.warn(`${recordedId} is protected`);
            throw new Error('RecordedIsProtected');
        }

        // 録画中なら停止
        if (
            isIgnoreProtection === false &&
            recorded.isRecording === true &&
            recorded.reserveId !== null &&
            this.recordingManageModel.hasReserve(recorded.reserveId) === true
        ) {
            this.log.system.info(
                `cancel recording by recorded manager reserveId: ${recorded.reserveId} recordedId: ${recorded.id}`,
            );
            await this.recordingManageModel.cancel(recorded.reserveId, true);
        }

        const hasThumbnails = typeof recorded.thumbnails !== 'undefined' && recorded.thumbnails.length > 0;
        const hasVideoFiles = typeof recorded.videoFiles !== 'undefined' && recorded.videoFiles.length > 0;

        // サムネイル実ファイル削除
        if (hasThumbnails === true && typeof recorded.thumbnails !== 'undefined') {
            for (const t of recorded.thumbnails) {
                const filePath = this.getThumbnailPath(t);
                this.log.system.info(`delete: ${filePath}`);
                await FileUtil.unlink(filePath).catch(err => {
                    this.log.system.error(`failed to delete ${filePath}`);
                    this.log.system.error(err);
                });
            }
        }

        // 録画ファイル実ファイル削除
        // ただし外部ストレージ (externalStorageName 設定あり) のファイルは残す
        if (hasVideoFiles === true && typeof recorded.videoFiles !== 'undefined') {
            for (const v of recorded.videoFiles) {
                if (typeof v.externalStorageName === 'string' && v.externalStorageName.length > 0) {
                    this.log.system.info(
                        `skip external storage file: videoFileId=${v.id} storage=${v.externalStorageName}`,
                    );
                    continue;
                }

                let filePath: string | null;
                try {
                    filePath = await this.videoUtil.getFullFilePathFromId(v.id);
                    if (filePath === null) {
                        throw new Error('GetVideoFilePathError');
                    }
                } catch (err: any) {
                    this.log.system.error(`get video file path error: ${v.id}`);
                    this.log.system.error(err);
                    this.log.system.error(v);
                    continue;
                }

                this.log.system.info(`delete: ${filePath}`);
                await FileUtil.unlink(filePath).catch(err => {
                    this.log.system.error(`failed to delete ${filePath}`);
                    this.log.system.error(err);
                });
            }
        }

        // ドロップログファイル削除処理
        if (typeof recorded.dropLogFile !== 'undefined' && recorded.dropLogFile !== null) {
            const filePath = this.getDropLogFilePath(recorded.dropLogFile);
            this.log.system.info(`delete: ${filePath}`);
            await FileUtil.unlink(filePath).catch(err => {
                this.log.system.error(`failed to delete ${filePath}`);
                this.log.system.error(err);
            });
        }

        // DB からサムネイル情報削除
        if (hasThumbnails === true) {
            this.thumbnailDB.deleteRecordedId(recordedId).catch(err => {
                this.log.system.error(`falied to delete thumbnail data: ${recordedId}`);
                this.log.system.error(err);
            });
        }

        // DB から録画ファイル情報削除
        if (hasVideoFiles === true) {
            await this.videoFileDB.deleteRecordedId(recordedId).catch(err => {
                this.log.system.error(`falied to delete video data: ${recordedId}`);
                this.log.system.error(err);
            });
        }

        // DB から録画情報削除
        await this.recordedDB.deleteOnce(recordedId).catch(err => {
            this.log.system.error(`falied to delete recorded data: ${recordedId}`);
            this.log.system.error(err);
        });

        // DB からドロップログファイル情報削除
        if (typeof recorded.dropLogFile !== 'undefined' && recorded.dropLogFile !== null) {
            await this.dropLogFileDB.deleteOnce(recorded.dropLogFile.id).catch(err => {
                this.log.system.error(`failed to delete drop log data: ${recorded.dropLogFile?.id}`);
                this.log.system.error(err);
            });
        }

        this.log.system.info(`successful delete recorded: ${recordedId}`);

        // イベント発行
        this.recordedEvent.emitDeleteRecorded(recorded);
    }

    /**
     * サムネイルファイルパス取得
     * @param thumbnail: Thumbnail
     * @return string
     */
    private getThumbnailPath(thumbnail: Thumbnail): string {
        return path.join(this.config.thumbnail, thumbnail.filePath);
    }

    /**
     * ドロップログファイルパス取得
     * @param dropLogFile: DropLogFile
     * @return string
     */
    private getDropLogFilePath(dropLogFile: DropLogFile): string {
        return path.join(this.config.dropLog, dropLogFile.filePath);
    }

    /**
     * 指定されて video file id のファイルサイズを更新する
     * @param videoFileId: apid.VideoFileId
     * @return Promise<void>;
     */
    public async updateVideoFileSize(videoFileId: apid.VideoFileId): Promise<void> {
        this.log.system.info(`update video file size: ${videoFileId}`);

        const filePath = await this.videoUtil.getFullFilePathFromId(videoFileId);
        if (filePath === null) {
            this.log.system.error(`video file is not found: ${videoFileId}`);
            throw new Error('VideoFileIsNotFound');
        }

        const fileSize = await FileUtil.getFileSize(filePath);

        await this.videoFileDB.updateSize(videoFileId, fileSize);

        this.recordedEvent.emitUpdateVideoFileSize(videoFileId);
    }

    /**
     * option で指定されたビデオファイルを追加する
     * @param option: AddVideoFileOption
     * @return Promise<apid.VideoFileId>
     */
    public async addVideoFile(option: AddVideoFileOption): Promise<apid.VideoFileId> {
        this.log.system.info(`add video file: ${option.recordedId} ${option.filePath}`);

        const parentDirPath = this.videoUtil.getParentDirPath(option.parentDirectoryName);
        if (parentDirPath === null) {
            this.log.system.error(`parent directory is null: ${option.parentDirectoryName}`);
            throw new Error('ParentDirectoryIsNull');
        }

        const fileSize = await FileUtil.getFileSize(path.join(parentDirPath, option.filePath));

        const videoFile = new VideoFile();
        videoFile.parentDirectoryName = option.parentDirectoryName;
        videoFile.filePath = option.filePath;
        videoFile.type = option.type;
        videoFile.name = option.name;
        videoFile.size = fileSize;
        videoFile.recordedId = option.recordedId;

        const newVideoFileId = await this.videoFileDB.insertOnce(videoFile).catch(err => {
            this.log.system.error(`failed to add video: ${option.parentDirectoryName}/${option.filePath}`);
            this.log.system.error(err);
            throw err;
        });

        this.recordedEvent.emitAddVideoFile(newVideoFileId);

        return newVideoFileId;
    }

    /**
     * option で指定されたビデオファイルを追加する
     * @param option: UploadedVideoFileInfo
     * @return Promise<void>
     */
    public async addUploadedVideoFile(option: UploadedVideoFileOption): Promise<void> {
        this.log.system.info(`add uploaded file: ${option.recordedId}`);

        // 指定された番組情報を取得
        const recorded = await this.recordedDB.findId(option.recordedId);
        if (recorded === null) {
            await FileUtil.unlink(option.filePath).catch(() => {});
            throw new Error('RecordedIdIsNull');
        }

        // 親ディレクトリ
        const parentDirPath = this.videoUtil.getParentDirPath(option.parentDirectoryName);
        if (parentDirPath === null) {
            this.log.system.error(`parent directory is null: ${option.parentDirectoryName}`);
            await FileUtil.unlink(option.filePath).catch(() => {});
            throw new Error('ParentDirectoryIsNull');
        }

        // サブディレクトリ
        let dirPath = parentDirPath;
        if (typeof option.subDirectory !== 'undefined') {
            dirPath = path.join(
                dirPath,
                await this.recordingUtilModel.formatFilePathString(option.subDirectory, recorded),
            );

            // check dir
            try {
                await FileUtil.stat(dirPath);
            } catch (err: any) {
                // mkdirp directory
                this.log.system.info(`mkdirp: ${dirPath}`);
                await mkdirp(dirPath);
            }
        }

        // コピー先のファイルパスを生成する
        const filePath = await this.getUploadedVideoFilePath(dirPath, option.fileName);

        // アップロードされたファイルを保存先へ移動する
        try {
            this.log.system.info(`move file ${option.filePath} -> ${filePath}`);
            await FileUtil.rename(option.filePath, filePath);
        } catch (err: any) {
            // move を試す
            try {
                await FileUtil.move(option.filePath, filePath);
            } catch (e: any) {
                this.log.system.error('move file error');
                this.log.system.error(e);
                await FileUtil.unlink(option.filePath).catch(() => {});

                throw new Error('FileMoveError');
            }
        }

        // DB に反映
        try {
            const fileName = path.basename(filePath);
            const videoFileId = await this.addVideoFile({
                recordedId: option.recordedId,
                parentDirectoryName: option.parentDirectoryName,
                filePath:
                    typeof option.subDirectory === 'undefined'
                        ? fileName
                        : path.join(
                              await this.recordingUtilModel.formatFilePathString(option.subDirectory, recorded),
                              fileName,
                          ),
                type: option.fileType,
                name: option.viewName,
            });

            // 通知
            const needsCreateThumbnail = typeof recorded.thumbnails === 'undefined' || recorded.thumbnails.length === 0;
            this.recordedEvent.emitAddUploadedVideoFile(videoFileId, needsCreateThumbnail);
        } catch (err: any) {
            await FileUtil.unlink(filePath).catch(() => {});
            throw err;
        }
    }

    /**
     * アップロードファイルの file path を取得する
     * @param dir: directory
     * @param fileName: file name
     * @param conflict: 同名ファイルがあった場合カウントされる
     * @return string
     */
    private async getUploadedVideoFilePath(dir: string, fileName: string, conflict: number = 0): Promise<string> {
        const extname = path.extname(fileName);
        const name = fileName.slice(0, fileName.length - extname.length);
        const count = conflict > 0 ? `(${conflict})` : '';

        const filePath = path.join(dir, `${name}${count}${extname}`);

        try {
            // 同盟のファイルが存在するか確認
            await FileUtil.stat(filePath);

            return this.getUploadedVideoFilePath(dir, fileName, conflict + 1);
        } catch (err: any) {
            return filePath;
        }
    }

    /**
     * 録画番組情報を新規作成
     * @param option: apid.CreateNewRecordedOption
     * @return Promise<apid.RecordedId>
     */
    public async createNewRecorded(option: apid.CreateNewRecordedOption): Promise<apid.RecordedId> {
        this.log.system.info('create new recorded');

        const recorded = new Recorded();
        recorded.isRecording = false;
        recorded.isProtected = false;
        if (typeof option.ruleId !== 'undefined') {
            recorded.ruleId = option.ruleId;
        }
        recorded.channelId = option.channelId;
        recorded.startAt = option.startAt;
        recorded.endAt = option.endAt;
        if (option.startAt - option.endAt >= 0) {
            throw new Error('TimeRangeError');
        }
        recorded.duration = option.endAt - option.startAt;
        recorded.name = StrUtil.toDBStr(option.name);
        recorded.halfWidthName = StrUtil.toHalf(option.name);
        if (typeof option.description !== 'undefined') {
            recorded.description = StrUtil.toDBStr(option.description);
            recorded.halfWidthDescription = StrUtil.toHalf(recorded.description);
        }
        if (typeof option.extended !== 'undefined') {
            recorded.extended = StrUtil.toDBStr(option.extended);
            recorded.halfWidthExtended = StrUtil.toHalf(recorded.extended);
        }
        if (typeof option.genre1 !== 'undefined') {
            recorded.genre1 = option.genre1;
        }
        if (typeof option.subGenre1 !== 'undefined') {
            recorded.subGenre1 = option.subGenre1;
        }
        if (typeof option.genre2 !== 'undefined') {
            recorded.genre2 = option.genre2;
        }
        if (typeof option.subGenre2 !== 'undefined') {
            recorded.subGenre2 = option.subGenre2;
        }
        if (typeof option.genre3 !== 'undefined') {
            recorded.genre3 = option.genre3;
        }
        if (typeof option.subGenre3 !== 'undefined') {
            recorded.subGenre3 = option.subGenre3;
        }

        const recordedId = await this.recordedDB.insertOnce(recorded).catch(err => {
            this.log.system.error(err);
            throw err;
        });

        this.log.system.info(`created new recorded: ${recordedId}`);

        this.recordedEvent.emitCreateNewRecorded(recordedId);

        return recordedId;
    }

    /**
     * 指定された video file id のファイルを削除する
     * @param videoFileid: apid.VideoFileId
     * @param isIgnoreProtection: boolean
     * @return Promise<void>
     */
    public async deleteVideoFile(videoFileid: apid.VideoFileId, isIgnoreProtection: boolean = false): Promise<void> {
        this.log.system.info(`delete video file: ${videoFileid}`);

        const video = await this.videoFileDB.findId(videoFileid);
        if (video === null) {
            this.log.system.info(`video file is not found: ${videoFileid}`);
            throw new Error('VideoFileIsNotFound');
        }

        // プロテクトがかかっているか確認
        let recorded = await this.recordedDB.findId(video.recordedId);
        if (isIgnoreProtection === false && recorded !== null && recorded.isProtected === true) {
            this.log.system.warn(`${videoFileid} is protected`);
            throw new Error('RecordedIsProtected');
        }

        // 録画中の場合は録画情報ごと削除
        if (recorded?.isRecording === true) {
            return await this.delete(video.recordedId, false);
        }

        // 外部ストレージ上のファイルは残し、DB レコードのみ削除
        const isExternal = typeof video.externalStorageName === 'string' && video.externalStorageName.length > 0;
        if (isExternal === false) {
            // 実ファイル削除
            const filePath = await this.videoUtil.getFullFilePathFromId(videoFileid);
            if (filePath !== null) {
                this.log.system.info(`delete: ${filePath}`);
                await FileUtil.unlink(filePath).catch(err => {
                    this.log.system.error(`failed to delete ${filePath}`);
                    this.log.system.error(err);
                });
            }
        } else {
            this.log.system.info(
                `skip external storage file: videoFileId=${videoFileid} storage=${video.externalStorageName}`,
            );
        }

        // DB から削除
        await this.videoFileDB.deleteOnce(videoFileid);

        // video に紐付けられていた recorded が空かチェック
        recorded = await this.recordedDB.findId(video.recordedId);
        if (recorded !== null && typeof recorded.videoFiles !== 'undefined' && recorded.videoFiles.length === 0) {
            // 空だったので recorded も削除
            this.log.system.info(`empty video files: ${video.recordedId}`);
            await this.delete(video.recordedId, false);
        } else {
            this.recordedEvent.emitDeleteVideoFile(videoFileid);
        }
    }

    /**
     * 保護状態を変更する
     * @param recordedId: apid.RecordedId
     * @param isProtect: boolean
     * @return Promise<void>
     */
    public async changeProtect(recordedId: apid.RecordedId, isProtect: boolean): Promise<void> {
        this.log.system.info((isProtect === true ? 'set protect' : 'remove protect') + `: ${recordedId}`);

        await this.recordedDB.changeProtect(recordedId, isProtect);
        this.recordedEvent.emitChangeProtect(recordedId, isProtect);
    }

    /**
     * RecordedHistory の保存期間外のデータを削除する
     * @return Promise<void>
     */
    public async historyCleanup(): Promise<void> {
        const date = new Date().getTime() - this.config.recordedHistoryRetentionPeriodDays * 24 * 60 * 60 * 1000;
        await this.recordedHistoryDB.delete(date).catch(err => {
            this.log.system.error('failed to historyCleanup');
            this.log.system.error(err);
        });
    }

    /**
     * DB に登録されていない recorded 下のファイル削除 &  DB に登録されているが存在しない番組情報の削除
     * @return Promise<void>
     */
    public async videoFileCleanup(): Promise<void> {
        this.log.system.info('start video files cleanup');

        const videoFiles = await this.videoFileDB.findAll();

        // ファイル, ディレクトリ索引生成と DB 上に存在するが実ファイルが存在しないデータを削除する
        const fileIndex: { [filePath: string]: boolean } = {}; // ファイル索引
        const dirIndex: { [dirPath: string]: boolean } = {}; // ディレクトリ索引
        for (const video of videoFiles) {
            const videoFilePath = this.videoUtil.getFullFilePathFromVideoFile(video);
            if (videoFilePath === null) {
                continue;
            }

            if ((await this.checkFileExistence(videoFilePath)) === true) {
                // ファイルが存在するなら索引に追加
                fileIndex[videoFilePath] = true;
                const parentDir = path.dirname(videoFilePath).replace(new RegExp(`\\${path.sep}$`), '');
                dirIndex[parentDir] = true;
            } else {
                // ファイルが存在しないなら削除
                await this.deleteVideoFile(video.id).catch(() => {});
            }
        }

        // 実ファイルリストを取得する
        const list: FileUtil.FileList = {
            files: [],
            directories: [],
        };
        for (const r of this.config.recorded) {
            const l = await FileUtil.getFileList(r.path);
            Array.prototype.push.apply(list.files, l.files);
            Array.prototype.push.apply(list.directories, l.directories);
            dirIndex[r.path] = true; // 親ディレクトリを索引に追加
        }
        // ディレクトリ削除時にネストが深いディレクトリから削除するためにソート
        list.directories.sort((dir1, dir2) => {
            return dir2.length - dir1.length;
        });

        // ファイル索引上に存在しないファイルを削除する
        for (const file of list.files) {
            if (typeof fileIndex[file] !== 'undefined') {
                continue;
            }

            this.log.system.info(`delete file: ${file}`);
            await FileUtil.unlink(file).catch(err => {
                this.log.system.error(`failed to delete file: ${file}`);
                this.log.system.error(err);
            });
        }

        // ディレクトリ索引上に存在しないディレクトリを削除する
        for (const dir of list.directories) {
            if (typeof dirIndex[dir] !== 'undefined') {
                continue;
            }

            this.log.system.info(`delete directory: ${dir}`);
            try {
                // ディレクトリが空かチェック
                if ((await FileUtil.isEmptyDirectory(dir)) === true) {
                    await FileUtil.rmdir(dir);
                } else {
                    this.log.system.warn(`directory is not empty: ${dir}`);
                }
            } catch (err: any) {
                this.log.system.error(`failed to delete directory: ${dir}`);
                this.log.system.error(err);
            }
        }

        this.log.system.info('start video files cleanup completed');
    }

    /**
     * DB に登録されていないログファイル削除 &  DB に登録されているが存在しないログ情報の削除
     */
    public async dropLogFileCleanup(): Promise<void> {
        this.log.system.info('start drop log files cleanup');
        const dropLogs = await this.dropLogFileDB.findAll();

        // ファイル, ディレクトリ索引生成と DB 上に存在するが実ファイルが存在しないデータを削除する
        const fileIndex: { [filePath: string]: boolean } = {}; // ファイル索引
        for (const dropLog of dropLogs) {
            const filePath = this.getDropLogFilePath(dropLog);

            if ((await this.checkFileExistence(filePath)) === true) {
                // ファイルが存在するなら索引に追加
                fileIndex[filePath] = true;
            } else {
                this.log.system.warn(`drop file is not exist: ${filePath}`);
                // ファイルが存在しないなら削除
                try {
                    await this.recordedDB.removeDropLogFileId(dropLog.id);
                    await this.dropLogFileDB.deleteOnce(dropLog.id);
                } catch (err: any) {
                    this.log.system.error(err);
                }
            }
        }

        // ファイル索引上に存在しないファイルを削除する
        const list = await FileUtil.getFileList(this.config.dropLog);
        for (const file of list.files) {
            if (typeof fileIndex[file] !== 'undefined') {
                continue;
            }

            this.log.system.info(`delete drop log file: ${file}`);
            await FileUtil.unlink(file).catch(err => {
                this.log.system.error(`failed to drop log file: ${file}`);
                this.log.system.error(err);
            });
        }

        this.log.system.info('start drop log files cleanup completed');
    }

    /**
     * 指定したファイルパスにファイルが存在するか
     * @param filePath: string ファイルパス
     * @return Promise<boolean> ファイルが存在するなら true を返す
     */
    private async checkFileExistence(filePath: string): Promise<boolean> {
        try {
            await FileUtil.stat(filePath);

            return true;
        } catch (err: any) {
            return false;
        }
    }

    /**
     * 指定された ruleId を録画情報から削除する
     * @param ruleId: apid.Rule
     */
    public async removeRuleId(ruleId: apid.RuleId): Promise<void> {
        await this.recordedDB.removeRuleId(ruleId);
    }

    /**
     * 録画番組を外部ストレージ (NAS 等) に移動する
     * - 物理ファイル(TS / エンコード / サムネイル) を target ディレクトリに copy + unlink
     * - VideoFile / Thumbnail レコードは削除
     * - Recorded.externalPath に target ディレクトリの絶対パスを設定
     * - DropLogFile は小さいので EPGStation 側に残す
     */
    public async moveToExternalStorage(option: MoveToExternalStorageOption): Promise<void> {
        this.log.system.info(`move to external storage: ${JSON.stringify(option)}`);

        // storage の検証
        const storages = this.config.externalStorage ?? [];
        const storage = storages.find(s => s.name === option.storageName);
        if (typeof storage === 'undefined') {
            throw new Error('ExternalStorageNotFound');
        }

        // subDirectory の path traversal ガード
        const subDir = (option.subDirectory ?? '').replace(/^\/+|\/+$/g, '');
        if (subDir.split('/').some(part => part === '..' || part === '.')) {
            throw new Error('InvalidSubDirectory');
        }

        // Recorded 取得 (videoFiles / thumbnails 込み)
        const recorded = await this.recordedDB.findId(option.recordedId);
        if (recorded === null) {
            throw new Error('RecordedIdIsNotFound');
        }
        if (recorded.isRecording === true) {
            throw new Error('RecordedIsRecording');
        }
        if (recorded.isProtected === true) {
            throw new Error('RecordedIsProtected');
        }
        if (typeof recorded.externalPath === 'string' && recorded.externalPath.length > 0) {
            throw new Error('RecordedAlreadyMoved');
        }

        const targetDir = subDir.length > 0 ? path.join(storage.path, subDir) : storage.path;
        await mkdirp(targetDir);

        // 移動対象は VideoFile (TS / エンコード済の両方) のみ。
        // Thumbnail は移動せず EPGStation 管理下のディレクトリに残し、
        // UI から引き続き表示できるようにする。
        const videoFiles = recorded.videoFiles ?? [];
        const allSrcDests: { src: string; dest: string; id: number }[] = [];
        for (const v of videoFiles) {
            const src = await this.videoUtil.getFullFilePathFromId(v.id);
            if (src === null) {
                throw new Error('SrcVideoPathNotResolved');
            }
            const dest = path.join(targetDir, path.basename(v.filePath));
            allSrcDests.push({ src, dest, id: v.id });
        }
        for (const sd of allSrcDests) {
            try {
                await FileUtil.stat(sd.dest);
                throw new Error(`DestinationAlreadyExists: ${sd.dest}`);
            } catch (err: any) {
                // 存在しない場合 stat は失敗する → OK
                if (err.message && err.message.startsWith('DestinationAlreadyExists')) {
                    throw err;
                }
            }
        }

        // 移動先の空き容量チェック
        let totalSize = 0;
        for (const sd of allSrcDests) {
            totalSize += await FileUtil.getFileSize(sd.src);
        }
        const available = await new Promise<number>((resolve, reject) => {
            diskusage(targetDir, (err, usage) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(usage.available);
                }
            });
        });
        if (totalSize > available) {
            this.log.system.error(
                `insufficient storage: recordedId=${option.recordedId} needed=${totalSize} available=${available}`,
            );
            throw new Error('InsufficientStorageSpace');
        }

        // 実移動: copy → unlink、エラー時はすでに移動済みのファイルをロールバック(best effort)
        const moved: { src: string; dest: string; id: number }[] = [];
        try {
            for (const sd of allSrcDests) {
                await FileUtil.move(sd.src, sd.dest);
                moved.push(sd);
            }
        } catch (err: any) {
            this.log.system.error(`move failed, rolling back: ${err.message}`);
            for (const m of moved) {
                await FileUtil.move(m.dest, m.src).catch(e => {
                    this.log.system.error(`rollback failed for ${m.dest}: ${e.message}`);
                });
            }
            throw err;
        }

        // DB 更新: VideoFile は保持し externalStorageName と filePath を更新
        // (Thumbnail は EPGStation 側に残す)
        const storageRelSubDir = subDir;
        for (const v of videoFiles) {
            const newFilePath =
                storageRelSubDir.length > 0
                    ? path.join(storageRelSubDir, path.basename(v.filePath))
                    : path.basename(v.filePath);
            await this.videoFileDB
                .moveToExternalStorage({
                    videoFileId: v.id,
                    externalStorageName: storage.name,
                    filePath: newFilePath,
                })
                .catch(e => {
                    this.log.system.error(`failed to update videoFile ${v.id}: ${e.message}`);
                });
        }

        await this.recordedDB.setExternalPath(option.recordedId, targetDir);

        this.log.system.info(`moved recorded ${option.recordedId} to ${targetDir}`);
    }
}

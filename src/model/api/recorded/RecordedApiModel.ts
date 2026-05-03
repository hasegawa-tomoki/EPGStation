import { inject, injectable } from 'inversify';
import * as apid from '../../../../api';
import IRecordedDB, { FindAllOption } from '../../db/IRecordedDB';
import IRuleDB from '../../db/IRuleDB';
import IIPCClient from '../../ipc/IIPCClient';
import { MoveToExternalStorageOption, UploadedVideoFileOption } from '../../operator/recorded/IRecordedManageModel';
import IEncodeManageModel from '../../service/encode/IEncodeManageModel';
import IRecordedItemUtil, { RuleKeywordIndex } from '../IRecordedItemUtil';
import IRecordedApiModel from './IRecordedApiModel';

@injectable()
export default class RecordedApiModel implements IRecordedApiModel {
    private ipc: IIPCClient;
    private recordedDB: IRecordedDB;
    private ruleDB: IRuleDB;
    private encodeManage: IEncodeManageModel;
    private recordedItemUtil: IRecordedItemUtil;

    constructor(
        @inject('IIPCClient') ipc: IIPCClient,
        @inject('IRecordedDB') recordedDB: IRecordedDB,
        @inject('IRuleDB') ruleDB: IRuleDB,
        @inject('IEncodeManageModel') encodeManage: IEncodeManageModel,
        @inject('IRecordedItemUtil') recordedItemUtil: IRecordedItemUtil,
    ) {
        this.recordedDB = recordedDB;
        this.ruleDB = ruleDB;
        this.ipc = ipc;
        this.encodeManage = encodeManage;
        this.recordedItemUtil = recordedItemUtil;
    }

    /**
     * Recorded 配列に含まれる ruleId の keyword を bulk で取得する
     */
    private async buildRuleKeywordIndex(ruleIds: (number | null | undefined)[]): Promise<RuleKeywordIndex> {
        const uniqueIds = Array.from(new Set(ruleIds.filter((id): id is number => typeof id === 'number')));
        const index: RuleKeywordIndex = {};
        await Promise.all(
            uniqueIds.map(async id => {
                const rule = await this.ruleDB.findId(id);
                if (rule !== null) {
                    index[id] = rule.searchOption?.keyword ?? null;
                }
            }),
        );
        return index;
    }

    /**
     * 録画情報の取得
     * @param option: GetRecordedOption
     * @return Promise<apid.Records>
     */
    public async gets(option: apid.GetRecordedOption): Promise<apid.Records> {
        (<FindAllOption>option).isRecording = false;
        const [records, total] = await this.recordedDB.findAll(option, {
            isNeedVideoFiles: true,
            isNeedThumbnails: true,
            isNeedsDropLog: true,
            isNeedTags: false,
        });

        const encodeIndex = this.encodeManage.getRecordedIndex();
        const ruleKeywordIndex = await this.buildRuleKeywordIndex(records.map(r => r.ruleId));

        return {
            records: records.map(r => {
                return this.recordedItemUtil.convertRecordedToRecordedItem(
                    r,
                    option.isHalfWidth,
                    encodeIndex,
                    ruleKeywordIndex,
                );
            }),
            total,
        };
    }

    /**
     * 指定した recorded id の録画情報を取得する
     * @param recordedId: apid.RecordedId
     * @param isHalfWidth: boolean 半角文字で返すか
     * @return Promise<apid.RecordedItem | null> null の場合録画情報が存在しない
     */
    public async get(recordedId: apid.RecordedId, isHalfWidth: boolean): Promise<apid.RecordedItem | null> {
        const item = await this.recordedDB.findId(recordedId);
        if (item === null) {
            return null;
        }

        const encodeIndex = this.encodeManage.getRecordedIndex();
        const ruleKeywordIndex = await this.buildRuleKeywordIndex([item.ruleId]);

        return this.recordedItemUtil.convertRecordedToRecordedItem(item, isHalfWidth, encodeIndex, ruleKeywordIndex);
    }

    /**
     * recorded の検索オプションリストを取得する
     * @return Promise<apid.RecordedSearchOptionList>
     */
    public async getSearchOptionList(): Promise<apid.RecordedSearchOptions> {
        const channels = await this.recordedDB.findChannelList();
        const genres = await this.recordedDB.findGenreList();

        return {
            channels: channels,
            genres: genres,
        };
    }

    /**
     *
     * @param recordedId: ReserveId
     * @return Promise<void>
     */
    public async delete(recordedId: apid.RecordedId): Promise<void> {
        await this.encodeManage.cancelEncodeByRecordedId(recordedId);

        return this.ipc.recorded.delete(recordedId);
    }

    /**
     * recordedId を指定してエンコードを停止させる
     * @param recordedId: apid.RecordedId
     * @return Promise<void>
     */
    public stopEncode(recordedId: apid.RecordedId): Promise<void> {
        return this.encodeManage.cancelEncodeByRecordedId(recordedId);
    }

    /**
     * 保護状態を変更する
     * @param recordedId: apid.RecordedId
     * @param isProtect: boolean
     * @return Promise<void>
     */
    public changeProtect(recordedId: apid.RecordedId, isProtect: boolean): Promise<void> {
        return this.ipc.recorded.changeProtect(recordedId, isProtect);
    }

    /**
     * 録画を transcribe フラグ ON にして transcribe サービスに enqueue する
     * @param recordedId: apid.RecordedId
     * @return Promise<void>
     */
    public requestTranscribe(recordedId: apid.RecordedId): Promise<void> {
        return this.ipc.recorded.requestTranscribe(recordedId);
    }

    /**
     * ファイルのクリーンアップ
     */
    public async fileCleanup(): Promise<void> {
        await this.ipc.recorded.videoFileCleanup();
        await this.ipc.recorded.dropLogFileCleanup();
    }

    /**
     * upload されたビデオファイルを追加する
     * @param option: UploadedVideoFileInfo
     * @return Promise<void>
     */
    public async addUploadedVideoFile(option: UploadedVideoFileOption): Promise<void> {
        await this.ipc.recorded.addUploadedVideoFile(option);
    }

    /**
     * 録画番組情報を新規作成
     * @param option: apid.CreateNewRecordedOption
     * @return Promise<apid.RecordedId>
     */
    public async createNewRecorded(option: apid.CreateNewRecordedOption): Promise<apid.RecordedId> {
        return await this.ipc.recorded.createNewRecorded(option);
    }

    /**
     * 録画番組を外部ストレージに移動する (物理ファイル移動 + DB 更新)
     * @param option: MoveToExternalStorageOption
     * @return Promise<void>
     */
    public async moveToExternalStorage(option: MoveToExternalStorageOption): Promise<void> {
        await this.ipc.recorded.moveToExternalStorage(option);
    }
}

import { inject, injectable } from 'inversify';
import * as apid from '../../../../api';
import IRecordedDB, { FindAllOption } from '../../db/IRecordedDB';
import IRuleDB from '../../db/IRuleDB';
import IIPCClient from '../../ipc/IIPCClient';
import IRecordedItemUtil, { RuleKeywordIndex } from '../IRecordedItemUtil';
import IRecordingApiModel from './IRecordingApiModel';

@injectable()
export default class RecordingApiModel implements IRecordingApiModel {
    private ipc: IIPCClient;
    private recordedDB: IRecordedDB;
    private ruleDB: IRuleDB;
    private recordedItemUtil: IRecordedItemUtil;

    constructor(
        @inject('IIPCClient') ipc: IIPCClient,
        @inject('IRecordedDB') recordedDB: IRecordedDB,
        @inject('IRuleDB') ruleDB: IRuleDB,
        @inject('IRecordedItemUtil') recordedItemUtil: IRecordedItemUtil,
    ) {
        this.ipc = ipc;
        this.recordedDB = recordedDB;
        this.ruleDB = ruleDB;
        this.recordedItemUtil = recordedItemUtil;
    }

    /**
     * 録画情報の取得
     * @param option: GetRecordedOption
     * @return Promise<apid.Records>
     */
    public async gets(option: apid.GetRecordedOption): Promise<apid.Records> {
        (<FindAllOption>option).isRecording = true;
        const [records, total] = await this.recordedDB.findAll(option, {
            isNeedVideoFiles: true,
            isNeedThumbnails: true,
            isNeedsDropLog: false,
            isNeedTags: false,
        });

        const uniqueRuleIds = Array.from(
            new Set(records.map(r => r.ruleId).filter((id): id is number => typeof id === 'number')),
        );
        const ruleKeywordIndex: RuleKeywordIndex = {};
        await Promise.all(
            uniqueRuleIds.map(async id => {
                const rule = await this.ruleDB.findId(id);
                if (rule !== null) {
                    ruleKeywordIndex[id] = rule.searchOption?.keyword ?? null;
                }
            }),
        );

        return {
            records: records.map(r => {
                return this.recordedItemUtil.convertRecordedToRecordedItem(
                    r,
                    option.isHalfWidth,
                    undefined,
                    ruleKeywordIndex,
                );
            }),
            total,
        };
    }

    /**
     * タイマーを再設定する
     * @return Promise<void>
     */
    public async resetTimer(): Promise<void> {
        await this.ipc.recording.resetTimer();
    }
}

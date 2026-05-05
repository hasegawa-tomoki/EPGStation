import { inject, injectable } from 'inversify';
import * as apid from '../../../../api';
import Reserve from '../../../db/entities/Reserve';
import IChannelDB from '../../db/IChannelDB';
import IReserveDB from '../../db/IReserveDB';
import IRuleDB from '../../db/IRuleDB';
import IIPCClient from '../../ipc/IIPCClient';
import IMirakurunClientModel from '../../IMirakurunClientModel';
import IReserveApiModel from './IReserveApiModel';

@injectable()
export default class ReserveApiModel implements IReserveApiModel {
    private ipc: IIPCClient;
    private reserveDB: IReserveDB;
    private ruleDB: IRuleDB;
    private channelDB: IChannelDB;
    private mirakurunClient: IMirakurunClientModel;

    constructor(
        @inject('IIPCClient') ipc: IIPCClient,
        @inject('IReserveDB') reserveDB: IReserveDB,
        @inject('IRuleDB') ruleDB: IRuleDB,
        @inject('IChannelDB') channelDB: IChannelDB,
        @inject('IMirakurunClientModel') mirakurunClient: IMirakurunClientModel,
    ) {
        this.ipc = ipc;
        this.reserveDB = reserveDB;
        this.ruleDB = ruleDB;
        this.channelDB = channelDB;
        this.mirakurunClient = mirakurunClient;
    }

    /**
     * 手動予約の追加
     * @param option: ManualReserveOption
     * @return ReserveId
     */
    public add(option: apid.ManualReserveOption): Promise<apid.ReserveId> {
        return this.ipc.reserveation.add(option);
    }

    /**
     * 手動予約の編集
     * @param reserveId: apid.ReserveId
     * @param option: apid.EditManualReserveOption
     * @return Promise<void>
     */
    public async edit(reserveId: apid.ReserveId, option: apid.EditManualReserveOption): Promise<void> {
        return this.ipc.reserveation.edit(reserveId, option);
    }

    /**
     * 指定した予約情報の取得
     * @param reserveId: apid.ReserveId
     * @param isHalfWidth: boolean 半角で取得するか
     * @return Promise<apid.ReserveItem | null>
     */
    public async get(reserveId: apid.ReserveId, isHalfWidth: boolean): Promise<apid.ReserveItem | null> {
        const reserve = await this.reserveDB.findId(reserveId);
        if (reserve === null) {
            return null;
        }
        const ruleNameMap = await this.buildRuleNameMap([reserve]);
        return this.toReserveItem(reserve, isHalfWidth, ruleNameMap);
    }

    /**
     * 予約情報の取得
     * @param option: GetReserveOption
     * @return Promise<apid.Reserves>
     */
    public async gets(option: apid.GetReserveOption): Promise<apid.Reserves> {
        const [reserves, total] = await this.reserveDB.findAll(option);
        const ruleNameMap = await this.buildRuleNameMap(reserves);

        return {
            reserves: reserves.map(r => {
                return this.toReserveItem(r, option.isHalfWidth, ruleNameMap);
            }),
            total,
        };
    }

    /**
     * reserves に含まれる ruleId から ruleId → keyword (ルール名) のマップを構築する
     */
    private async buildRuleNameMap(reserves: Reserve[]): Promise<Map<apid.RuleId, string>> {
        const map = new Map<apid.RuleId, string>();
        const ruleIds = new Set<apid.RuleId>();
        for (const r of reserves) {
            if (r.ruleId !== null) {
                ruleIds.add(r.ruleId);
            }
        }
        await Promise.all(
            Array.from(ruleIds).map(async id => {
                const rule = await this.ruleDB.findId(id);
                if (
                    rule !== null &&
                    typeof rule.searchOption?.keyword === 'string' &&
                    rule.searchOption.keyword.length > 0
                ) {
                    map.set(id, rule.searchOption.keyword);
                }
            }),
        );
        return map;
    }

    /**
     * Reserve を ReserveItem へ変換する
     * @param reserves: Reserve
     * @param isHalfWidth: boolean 半角文字で返すか
     * @return ReserveItem
     */
    private toReserveItem(
        reserve: Reserve,
        isHalfWidth: boolean,
        ruleNameMap: Map<apid.RuleId, string>,
    ): apid.ReserveItem {
        const item: apid.ReserveItem = {
            id: reserve.id,
            isSkip: reserve.isSkip,
            isConflict: reserve.isConflict,
            isOverlap: reserve.isOverlap,
            allowEndLack: reserve.allowEndLack,
            isTimeSpecified: reserve.isTimeSpecified,
            isDeleteOriginalAfterEncode: reserve.isDeleteOriginalAfterEncode,
            channelId: reserve.channelId,
            startAt: reserve.startAt,
            endAt: reserve.endAt,
            name: isHalfWidth ? reserve.halfWidthName : reserve.name,
        };

        if (reserve.ruleId !== null) {
            item.ruleId = reserve.ruleId;
            const ruleName = ruleNameMap.get(reserve.ruleId);
            if (typeof ruleName === 'string') {
                item.ruleName = ruleName;
            }
        }
        if (reserve.tags !== null) {
            item.tags = JSON.parse(reserve.tags);
        }
        if (reserve.parentDirectoryName !== null) {
            item.parentDirectoryName = reserve.parentDirectoryName;
        }
        if (reserve.directory !== null) {
            item.directory = reserve.directory;
        }
        if (reserve.recordedFormat !== null) {
            item.recordedFormat = reserve.recordedFormat;
        }
        if (reserve.encodeMode1 !== null) {
            item.encodeMode1 = reserve.encodeMode1;
        }
        if (reserve.encodeParentDirectoryName1 !== null) {
            item.encodeParentDirectoryName1 = reserve.encodeParentDirectoryName1;
        }
        if (reserve.encodeDirectory1 !== null) {
            item.encodeDirectory1 = reserve.encodeDirectory1;
        }
        if (reserve.encodeMode2 !== null) {
            item.encodeMode2 = reserve.encodeMode2;
        }
        if (reserve.encodeParentDirectoryName2 !== null) {
            item.encodeParentDirectoryName2 = reserve.encodeParentDirectoryName2;
        }
        if (reserve.encodeDirectory3 !== null) {
            item.encodeDirectory3 = reserve.encodeDirectory3;
        }
        if (reserve.encodeMode3 !== null) {
            item.encodeMode3 = reserve.encodeMode3;
        }
        if (reserve.encodeParentDirectoryName3 !== null) {
            item.encodeParentDirectoryName3 = reserve.encodeParentDirectoryName3;
        }
        if (reserve.encodeDirectory3 !== null) {
            item.encodeDirectory3 = reserve.encodeDirectory3;
        }
        if (reserve.programId !== null) {
            item.programId = reserve.programId;
        }
        if (reserve.description !== null) {
            if (isHalfWidth === true) {
                if (reserve.halfWidthDescription !== null) {
                    item.description = reserve.halfWidthDescription;
                }
            } else {
                item.description = reserve.description;
            }
        }
        if (reserve.extended !== null) {
            if (isHalfWidth === true) {
                if (reserve.halfWidthExtended !== null) {
                    item.extended = reserve.halfWidthExtended;
                }
            } else {
                item.extended = reserve.extended;
            }
        }
        if (reserve.rawExtended !== null) {
            if (isHalfWidth === true) {
                if (reserve.rawHalfWidthExtended !== null) {
                    item.rawExtended = JSON.parse(reserve.rawHalfWidthExtended);
                }
            } else {
                item.rawExtended = JSON.parse(reserve.rawExtended);
            }
        }
        if (reserve.genre1 !== null) {
            item.genre1 = reserve.genre1;
        }
        if (reserve.subGenre1 !== null) {
            item.subGenre1 = reserve.subGenre1;
        }
        if (reserve.genre2 !== null) {
            item.genre2 = reserve.genre2;
        }
        if (reserve.subGenre2 !== null) {
            item.subGenre2 = reserve.subGenre2;
        }
        if (reserve.genre3 !== null) {
            item.genre3 = reserve.genre3;
        }
        if (reserve.subGenre3 !== null) {
            item.subGenre3 = reserve.subGenre3;
        }
        if (reserve.videoType !== null) {
            item.videoType = <any>reserve.videoType;
        }
        if (reserve.videoResolution !== null) {
            item.videoResolution = <any>reserve.videoResolution;
        }
        if (reserve.videoStreamContent !== null) {
            item.videoStreamContent = reserve.videoStreamContent;
        }
        if (reserve.videoComponentType !== null) {
            item.videoComponentType = reserve.videoComponentType;
        }
        if (reserve.audioSamplingRate !== null) {
            item.audioSamplingRate = <any>reserve.audioSamplingRate;
        }
        if (typeof reserve.createdUser === 'string' && reserve.createdUser.length > 0) {
            item.createdUser = reserve.createdUser;
        }
        if (reserve.transcribe) {
            item.transcribe = true;
        }

        return item;
    }

    /**
     * 予約情報のリスト
     * 予約, 除外, 重複, 競合の reserveId リストを返す
     * @param option: GetReserveListsOption
     * @return Promise<apid.ReserveLists>
     */
    public async getLists(option: apid.GetReserveListsOption): Promise<apid.ReserveLists> {
        const reserves = await this.reserveDB.findLists(option);

        const result: apid.ReserveLists = {
            normal: [],
            conflicts: [],
            skips: [],
            overlaps: [],
        };

        for (const reserve of reserves) {
            const item = this.toReserveListItem(reserve);
            if (reserve.isConflict === true) {
                result.conflicts.push(item);
            } else if (reserve.isSkip === true) {
                result.skips.push(item);
            } else if (reserve.isOverlap === true) {
                result.overlaps.push(item);
            } else {
                result.normal.push(item);
            }
        }

        return result;
    }

    /**
     * 予約数を返す
     * @return Promise<apid.ReserveCnts>
     */
    public async getCnts(): Promise<apid.ReserveCnts> {
        const reserves = await this.reserveDB.findLists();

        const result: apid.ReserveCnts = {
            normal: 0,
            conflicts: 0,
            skips: 0,
            overlaps: 0,
        };

        for (const reserve of reserves) {
            if (reserve.isConflict === true) {
                result.conflicts++;
            } else if (reserve.isSkip === true) {
                result.skips++;
            } else if (reserve.isOverlap === true) {
                result.overlaps++;
            } else {
                result.normal++;
            }
        }

        return result;
    }

    /**
     * Reserve を ReserveListItem へ変換する
     * @param reserve: Reserve
     * @return ReserveListItem
     */
    private toReserveListItem(reserve: Reserve): apid.ReserveListItem {
        const result: apid.ReserveListItem = {
            reserveId: reserve.id,
        };

        if (reserve.programId !== null) {
            result.programId = reserve.programId;
        }
        if (reserve.ruleId !== null) {
            result.ruleId = reserve.ruleId;
        }

        return result;
    }

    /**
     * チューナーの占有予約情報を返す (使用状況可視化用)
     * 内部の reserves を時刻イベント順に並べ、Tuner クラスと同じ条件
     * (受信可能 type かつ 同 channel) で割り当てシミュレーションを行う。
     */
    public async getTunerAllocations(isHalfWidth: boolean): Promise<apid.TunerAllocations> {
        const tunerDevices = await this.mirakurunClient.getClient().getTuners();

        // schedule 範囲: 現在以降の有効予約
        const now = new Date().getTime();
        const [reserves] = await this.reserveDB.findAll({
            type: 'normal',
            isHalfWidth: isHalfWidth,
        });
        const active = reserves.filter(r => !r.isSkip && !r.isOverlap && !r.isConflict && r.endAt > now);

        // 時刻イベント生成 (start/end)
        type Ev = { at: number; kind: 'start' | 'end'; idx: number };
        const events: Ev[] = [];
        active.forEach((r, idx) => {
            events.push({ at: r.startAt, kind: 'start', idx });
            events.push({ at: r.endAt, kind: 'end', idx });
        });
        events.sort((a, b) => (a.at !== b.at ? a.at - b.at : a.kind === 'end' ? -1 : 1));

        // 単純な割り当てシミュレーション (Tuner.add と同じ条件: types 一致 かつ 0 件 or 同じ channel)
        type TunerSlot = { types: string[]; channel: string | null; activeCount: number };
        const slots: TunerSlot[] = tunerDevices.map(t => ({
            types: t.types as string[],
            channel: null,
            activeCount: 0,
        }));
        const assignment = new Map<number, number>(); // reserveId -> tunerIndex
        const liveByIdx = new Map<number, number>(); // active reserve idx -> assigned tuner index

        for (const ev of events) {
            const r = active[ev.idx];
            if (ev.kind === 'start') {
                let assigned = -1;
                for (let i = 0; i < slots.length; i++) {
                    if (slots[i].types.indexOf(r.channelType) === -1) continue;
                    if (slots[i].activeCount === 0 || slots[i].channel === r.channel) {
                        if (slots[i].activeCount === 0) slots[i].channel = r.channel;
                        slots[i].activeCount++;
                        assigned = i;
                        break;
                    }
                }
                if (assigned >= 0) {
                    assignment.set(r.id, assigned);
                    liveByIdx.set(ev.idx, assigned);
                }
            } else {
                const i = liveByIdx.get(ev.idx);
                if (typeof i === 'number') {
                    slots[i].activeCount--;
                    if (slots[i].activeCount === 0) slots[i].channel = null;
                    liveByIdx.delete(ev.idx);
                }
            }
        }

        // channel 名を取得
        const channels = await this.channelDB.findAll();
        const channelMap = new Map<apid.ChannelId, { name: string; halfWidthName: string }>();
        for (const c of channels) {
            channelMap.set(c.id, { name: c.name, halfWidthName: c.halfWidthName });
        }

        const allocations: apid.TunerAllocationItem[] = [];
        for (const r of active) {
            const tunerIndex = assignment.get(r.id);
            if (typeof tunerIndex !== 'number') continue;
            const ch = channelMap.get(r.channelId);
            allocations.push({
                reserveId: r.id,
                tunerIndex,
                startAt: r.startAt,
                endAt: r.endAt,
                name: isHalfWidth ? r.halfWidthName : r.name,
                channelId: r.channelId,
                channelName: ch === undefined ? '' : isHalfWidth ? ch.halfWidthName : ch.name,
                channelType: r.channelType,
            });
        }
        allocations.sort((a, b) => a.startAt - b.startAt);

        return {
            tuners: tunerDevices.map((t, i) => ({ index: i, types: t.types as string[] })),
            allocations,
        };
    }

    /**
     * 予約キャンセル
     * @param reserveId: ReserveId
     * @return Promise<void>
     */
    public cancel(reserveId: apid.ReserveId): Promise<void> {
        return this.ipc.reserveation.cancel(reserveId);
    }

    /**
     * 予約の除外状態を解除する
     * @param reserveId: ReserveId
     * @return Promise<void>
     */
    public removeSkip(reserveId: apid.ReserveId): Promise<void> {
        return this.ipc.reserveation.removeSkip(reserveId);
    }

    /**
     * 予約の重複状態を解除する
     * @param reserveId: ReserveId
     * @return Promise<void>
     */
    public removeOverlap(reserveId: apid.ReserveId): Promise<void> {
        return this.ipc.reserveation.removeOverlap(reserveId);
    }

    /**
     * 全ての予約情報の更新
     * @return Promise<void>
     */
    public updateAll(): Promise<void> {
        return this.ipc.reserveation.updateAll(false);
    }
}

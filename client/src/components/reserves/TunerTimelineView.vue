<template>
    <div class="tuner-timeline" v-bind:class="{ isDark: $vuetify.theme.dark === true }">
        <div v-if="loading" class="loading-area">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
        </div>
        <div v-else-if="data === null || data.tuners.length === 0" class="empty-area">チューナー情報を取得できません</div>
        <div v-else class="timeline-wrap">
            <div class="columns-wrap">
                <div class="time-axis">
                    <div class="header axis-header">時刻</div>
                    <div class="track" :style="{ height: trackHeightPx + 'px' }">
                        <div
                            v-for="(slot, i) in timeSlots"
                            :key="`s${i}`"
                            class="time-tick"
                            :class="{ 'time-tick--hour': slot.isHour }"
                            :style="{ top: slot.topPx + 'px', height: rowPx + 'px' }"
                        >
                            <div v-if="slot.isHour" class="hm-label">{{ slot.label }}</div>
                        </div>
                    </div>
                </div>
                <div v-for="tuner in data.tuners" :key="`t${tuner.index}`" class="tuner-column">
                    <div class="header tuner-header">
                        <div class="tuner-name">T{{ tuner.index }}</div>
                        <div class="tuner-types">{{ tuner.types.join('/') }}</div>
                    </div>
                    <div class="track" :style="{ height: trackHeightPx + 'px' }">
                        <div
                            v-for="block in blocksByTuner[tuner.index] || []"
                            :key="`b${block.reserveId}`"
                            class="reserve-block"
                            :class="`type-${block.channelType.toLowerCase()}`"
                            :style="{ top: block.topPx + 'px', height: block.heightPx + 'px' }"
                            :title="`${block.name}\n${block.channelName}\n${block.timeRange}`"
                        >
                            <div class="block-time">
                                <span v-if="block.isRecording" class="rec-badge">録画中</span>
                                <span>{{ block.timeRange }}</span>
                            </div>
                            <div class="block-name block-name--clickable" v-on:click="onClickName(block.reserveId)">{{ block.name }}</div>
                            <div class="block-channel">{{ block.channelName }}</div>
                        </div>
                    </div>
                </div>
                <div class="day-header-overlay" :style="{ top: headerHeightPx + 'px' }">
                    <div
                        v-for="db in dayBreakSlots"
                        :key="`dh${db.index}`"
                        class="day-header-band"
                        :style="{ top: db.topPx + 'px', height: dayHeaderPx + 'px', lineHeight: dayHeaderPx + 'px' }"
                    >
                        {{ db.dayLabel }}
                    </div>
                </div>
            </div>
        </div>
        <ReserveDialog :isOpen.sync="isOpenDialog" :reserve="dialogReserve"></ReserveDialog>
    </div>
</template>

<script lang="ts">
import ReserveDialog from '@/components/reserves/ReserveDialog.vue';
import IReservesApiModel from '@/model/api/reserves/IReservesApiModel';
import container from '@/model/ModelContainer';
import ISocketIOModel from '@/model/socketio/ISocketIOModel';
import IReserveStateUtil, { ReserveStateData } from '@/model/state/reserve/IReserveStateUtil';
import ISnackbarState from '@/model/state/snackbar/ISnackbarState';
import { ISettingStorageModel } from '@/model/storage/setting/ISettingStorageModel';
import { Component, Vue } from 'vue-property-decorator';
import * as apid from '../../../../api';

const SLOT_MIN = 30; // 30 分刻み
const ROW_PX = 30; // 30 分 = 30px
const DAY_HEADER_PX = 30; // 日付ヘッダ band の高さ (band 26px + 余白 4px)
const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

interface TimeSlot {
    label: string;
    isHour: boolean;
    isDayBreak: boolean;
    dayLabel: string;
    topPx: number; // この slot の絶対 top (前にある day-header の累積 px を含む)
    headerOffsetBeforePx: number; // この slot の手前にあるべき day-header の top (この slot が dayBreak のときのみ有効)
}
interface Block {
    reserveId: number;
    name: string;
    channelName: string;
    channelType: string;
    timeRange: string;
    topPx: number;
    heightPx: number;
    isRecording: boolean;
}

@Component({
    components: { ReserveDialog },
})
export default class TunerTimelineView extends Vue {
    public isOpenDialog: boolean = false;
    public dialogReserve: ReserveStateData | null = null;
    public loading: boolean = true;
    public data: apid.TunerAllocations | null = null;
    public timeSlots: TimeSlot[] = [];
    public blocksByTuner: { [key: number]: Block[] } = {};
    public rowPx: number = ROW_PX;
    public dayHeaderPx: number = DAY_HEADER_PX;
    private totalHeaderPx: number = 0;

    private reservesApiModel: IReservesApiModel = container.get<IReservesApiModel>('IReservesApiModel');
    private reserveStateUtil: IReserveStateUtil = container.get<IReserveStateUtil>('IReserveStateUtil');
    private setting: ISettingStorageModel = container.get<ISettingStorageModel>('ISettingStorageModel');
    private socketIoModel: ISocketIOModel = container.get<ISocketIOModel>('ISocketIOModel');
    private snackbarState: ISnackbarState = container.get<ISnackbarState>('ISnackbarState');
    private startEpochMin: number = 0;

    private onUpdate = (async (): Promise<void> => {
        await this.fetch();
    }).bind(this);

    public async created(): Promise<void> {
        await this.fetch();
        this.socketIoModel.onUpdateState(this.onUpdate);
    }

    public beforeDestroy(): void {
        this.socketIoModel.offUpdateState(this.onUpdate);
    }

    get trackHeightPx(): number {
        return this.timeSlots.length * ROW_PX + this.totalHeaderPx;
    }

    get dayBreakSlots(): Array<{ index: number; dayLabel: string; topPx: number }> {
        const result: Array<{ index: number; dayLabel: string; topPx: number }> = [];
        this.timeSlots.forEach((s, i) => {
            // band は対象 slot の topPx から DAY_HEADER_PX 分だけ上に置く (slot 本体と重ならない位置)
            if (s.isDayBreak) result.push({ index: i, dayLabel: s.dayLabel, topPx: s.topPx - DAY_HEADER_PX });
        });
        return result;
    }

    get headerHeightPx(): number {
        return 44; // .header の height と一致
    }

    private async fetch(): Promise<void> {
        try {
            const isHalf = this.setting.getSavedValue().isHalfWidthDisplayed;
            const data = await this.reservesApiModel.getTunerAllocations(isHalf);
            this.data = data;
            this.buildTimeline(data);
        } catch (err) {
            this.snackbarState.open({ color: 'error', text: 'チューナー情報の取得に失敗' });
            console.error(err);
        } finally {
            this.loading = false;
        }
    }

    private buildTimeline(data: apid.TunerAllocations): void {
        const now = new Date();
        const startMs = Math.floor(now.getTime() / (SLOT_MIN * 60 * 1000)) * (SLOT_MIN * 60 * 1000);
        let endMs = startMs + SLOT_MIN * 60 * 1000;
        for (const a of data.allocations) {
            if (a.endAt > endMs) endMs = a.endAt;
        }
        endMs = Math.ceil(endMs / (SLOT_MIN * 60 * 1000)) * (SLOT_MIN * 60 * 1000);

        this.startEpochMin = startMs / 60000;
        const endEpochMin = endMs / 60000;
        const slotsCount = Math.max(1, (endEpochMin - this.startEpochMin) / SLOT_MIN);

        const slots: TimeSlot[] = [];
        let lastDayKey = '';
        let cumulativeHeaderPx = 0;
        for (let i = 0; i < slotsCount; i++) {
            const m = this.startEpochMin + i * SLOT_MIN;
            const d = new Date(m * 60000);
            const hh = d.getHours();
            const mm = d.getMinutes();
            const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const isDayBreak = dayKey !== lastDayKey;
            lastDayKey = dayKey;
            const headerOffsetBefore = cumulativeHeaderPx; // この slot の手前にあるべき header の top
            if (isDayBreak) cumulativeHeaderPx += DAY_HEADER_PX;
            slots.push({
                label: `${this.zeroPad(hh)}:${this.zeroPad(mm)}`,
                isHour: mm === 0,
                isDayBreak,
                dayLabel: this.fmtFullDate(d),
                topPx: i * ROW_PX + cumulativeHeaderPx,
                headerOffsetBeforePx: headerOffsetBefore,
            });
        }
        this.timeSlots = slots;
        this.totalHeaderPx = cumulativeHeaderPx;

        const nowMs = now.getTime();
        const buckets: { [key: number]: Block[] } = {};
        for (const a of data.allocations) {
            const startMin = a.startAt / 60000;
            const endMin = a.endAt / 60000;
            if (endMin <= this.startEpochMin) continue;
            const clampedStart = Math.max(startMin, this.startEpochMin);
            const isRecording = a.startAt <= nowMs && nowMs < a.endAt;
            const startTop = this.timeMinToTopPx(clampedStart, slots);
            const endTop = this.timeMinToTopPx(endMin, slots);
            const block: Block = {
                reserveId: a.reserveId,
                name: a.name,
                channelName: a.channelName,
                channelType: a.channelType,
                timeRange: this.formatTimeRange(a.startAt, a.endAt, nowMs),
                topPx: startTop,
                heightPx: Math.max(ROW_PX / 2, endTop - startTop),
                isRecording,
            };
            if (typeof buckets[a.tunerIndex] === 'undefined') buckets[a.tunerIndex] = [];
            buckets[a.tunerIndex].push(block);
        }
        this.blocksByTuner = buckets;
    }

    /** ブロックの番組名クリック時: API から ReserveItem を取り直して ReserveDialog を表示 */
    public async onClickName(reserveId: number): Promise<void> {
        try {
            const isHalf = this.setting.getSavedValue().isHalfWidthDisplayed;
            const item = await this.reservesApiModel.get(reserveId, isHalf);
            const stateDatas = this.reserveStateUtil.convertReserveItemsToStateDatas([item], isHalf);
            if (stateDatas.length === 0) return;
            this.dialogReserve = stateDatas[0];
            this.isOpenDialog = true;
        } catch (err) {
            this.snackbarState.open({ color: 'error', text: '予約情報の取得に失敗' });
            console.error(err);
        }
    }

    /** 任意の時刻 (epoch min) をトラック上の top px に変換。slot 内は分数比例で配置する。 */
    private timeMinToTopPx(timeMin: number, slots: TimeSlot[]): number {
        if (slots.length === 0) return 0;
        const offsetMin = timeMin - this.startEpochMin;
        const idx = Math.floor(offsetMin / SLOT_MIN);
        if (idx <= 0) return slots[0].topPx;
        if (idx >= slots.length) {
            const last = slots[slots.length - 1];
            return last.topPx + ROW_PX;
        }
        const slot = slots[idx];
        const intra = offsetMin - idx * SLOT_MIN;
        return slot.topPx + (intra / SLOT_MIN) * ROW_PX;
    }

    /** "hh:mm-hh:mm (xx分後 / x時間x分後)" — 日付は別の day-header-band 行で出すのでここでは出さない */
    private formatTimeRange(startAt: number, endAt: number, nowMs: number): string {
        const head = `${this.fmtHM(startAt)}-${this.fmtHM(endAt)}`;
        const diffMin = Math.floor((startAt - nowMs) / 60000);
        if (diffMin <= 0) return head;
        if (diffMin < 60) return `${head} (${diffMin}分後)`;
        const h = Math.floor(diffMin / 60);
        const m = diffMin % 60;
        return m === 0 ? `${head} (${h}時間後)` : `${head} (${h}時間${m}分後)`;
    }

    private fmtFullDate(d: Date): string {
        return `${d.getFullYear()}/${this.zeroPad(d.getMonth() + 1)}/${this.zeroPad(d.getDate())}（${DAY_LABELS[d.getDay()]}）`;
    }

    private zeroPad(n: number): string {
        return `0${n}`.slice(-2);
    }

    private fmtHM(ms: number): string {
        const d = new Date(ms);
        return `${this.zeroPad(d.getHours())}:${this.zeroPad(d.getMinutes())}`;
    }
}
</script>

<style lang="sass" scoped>
.tuner-timeline
    padding: 8px

    --tt-border: rgba(0, 0, 0, 0.12)
    --tt-border-soft: rgba(0, 0, 0, 0.06)
    --tt-bg-strong: rgba(0, 0, 0, 0.06)
    --tt-bg-medium: rgba(0, 0, 0, 0.04)
    --tt-bg-weak: rgba(0, 0, 0, 0.02)
    --tt-fg-strong: rgba(0, 0, 0, 0.85)
    --tt-fg-mid: rgba(0, 0, 0, 0.7)
    --tt-fg-weak: rgba(0, 0, 0, 0.55)

    &.isDark
        --tt-border: rgba(255, 255, 255, 0.18)
        --tt-border-soft: rgba(255, 255, 255, 0.08)
        --tt-bg-strong: rgba(255, 255, 255, 0.10)
        --tt-bg-medium: rgba(255, 255, 255, 0.06)
        --tt-bg-weak: rgba(255, 255, 255, 0.03)
        --tt-fg-strong: rgba(255, 255, 255, 0.92)
        --tt-fg-mid: rgba(255, 255, 255, 0.78)
        --tt-fg-weak: rgba(255, 255, 255, 0.6)

.loading-area, .empty-area
    display: flex
    align-items: center
    justify-content: center
    min-height: 200px
    opacity: 0.6
    font-size: 14px

.timeline-wrap
    border: 1px solid var(--tt-border)
    background-color: var(--tt-bg-weak)
    overflow-x: auto

.columns-wrap
    display: flex
    align-items: flex-start
    position: relative
    min-width: max-content

.time-axis
    flex: 0 0 80px
    border-right: 1px solid var(--tt-border)
    background-color: var(--tt-bg-medium)

.tuner-column
    flex: 1 0 220px
    min-width: 220px
    border-right: 1px solid var(--tt-border-soft)

.header
    height: 44px
    display: flex
    flex-direction: column
    align-items: center
    justify-content: center
    font-size: 14px
    font-weight: 600
    color: var(--tt-fg-strong)
    background-color: var(--tt-bg-strong)
    border-bottom: 1px solid var(--tt-border)
    position: sticky
    top: 0
    z-index: 2

.tuner-types
    font-weight: 400
    opacity: 0.7
    font-size: 12px

.track
    position: relative

.time-tick
    position: absolute
    left: 0
    right: 0
    color: var(--tt-fg-weak)
    padding: 2px 8px
    box-sizing: border-box
    font-size: 13px
    line-height: 1.2

    &--hour
        font-weight: 600
        color: var(--tt-fg-mid)
        border-top: 1px solid var(--tt-border)

    .hm-label
        font-size: 13px

.day-header-overlay
    position: absolute
    top: 0
    left: 0
    right: 0
    pointer-events: none
    z-index: 3

.day-header-band
    position: absolute
    left: 0
    right: 0
    height: 26px
    line-height: 26px
    padding: 0 12px
    background-color: rgba(33, 150, 243, 0.20)
    border-top: 2px solid rgba(33, 150, 243, 0.8)
    border-bottom: 1px solid rgba(33, 150, 243, 0.5)
    font-weight: 700
    font-size: 13px
    color: var(--tt-fg-strong)
    box-sizing: border-box

.reserve-block
    position: absolute
    left: 2px
    right: 2px
    background-color: rgba(33, 150, 243, 0.18)
    border: 1px solid rgba(33, 150, 243, 0.6)
    border-radius: 3px
    padding: 3px 5px
    font-size: 13px
    line-height: 1.25
    overflow: hidden
    box-sizing: border-box
    z-index: 1

    &.type-gr
        background-color: rgba(76, 175, 80, 0.18)
        border-color: rgba(76, 175, 80, 0.6)
    &.type-bs
        background-color: rgba(33, 150, 243, 0.18)
        border-color: rgba(33, 150, 243, 0.6)
    &.type-cs
        background-color: rgba(156, 39, 176, 0.18)
        border-color: rgba(156, 39, 176, 0.6)

    .block-time
        font-weight: 600
        font-size: 12px
        opacity: 0.85
        display: flex
        align-items: center
        gap: 6px
        flex-wrap: wrap

    .rec-badge
        background-color: #d32f2f
        color: white
        font-size: 11px
        font-weight: 700
        padding: 1px 6px
        border-radius: 3px

    .block-name
        font-weight: 500
        font-size: 14px
        white-space: nowrap
        overflow: hidden
        text-overflow: ellipsis

        &--clickable
            cursor: pointer
            text-decoration: underline
            text-decoration-thickness: 1px
            text-decoration-color: rgba(0, 0, 0, 0.25)
            &:hover
                text-decoration-color: currentColor

    .block-channel
        opacity: 0.75
        font-size: 12px
        white-space: nowrap
        overflow: hidden
        text-overflow: ellipsis
</style>

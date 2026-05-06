<template>
    <div class="tuner-timeline">
        <div v-if="loading" class="loading-area">
            <v-progress-circular indeterminate color="primary"></v-progress-circular>
        </div>
        <div v-else-if="data === null || data.tuners.length === 0" class="empty-area">チューナー情報を取得できません</div>
        <div v-else class="timeline-wrap">
            <div class="time-axis">
                <div class="header axis-header">時刻</div>
                <div class="track" :style="{ height: trackHeightPx + 'px' }">
                    <div
                        v-for="(slot, i) in timeSlots"
                        :key="`s${i}`"
                        class="time-tick"
                        :class="{ 'time-tick--hour': slot.isHour, 'time-tick--day': slot.isDayBreak }"
                        :style="{ top: i * rowPx + 'px', height: rowPx + 'px' }"
                    >
                        <div v-if="slot.isDayBreak" class="day-label">{{ slot.dayLabel }}</div>
                        <div class="hm-label">{{ slot.label }}</div>
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
                        v-for="db in dayBreakSlots"
                        :key="`d${tuner.index}-${db.index}`"
                        class="day-break-line"
                        :style="{ top: db.index * rowPx + 'px' }"
                    ></div>
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
                        <div class="block-name">{{ block.name }}</div>
                        <div class="block-channel">{{ block.channelName }}</div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script lang="ts">
import IReservesApiModel from '@/model/api/reserves/IReservesApiModel';
import container from '@/model/ModelContainer';
import ISocketIOModel from '@/model/socketio/ISocketIOModel';
import ISnackbarState from '@/model/state/snackbar/ISnackbarState';
import { ISettingStorageModel } from '@/model/storage/setting/ISettingStorageModel';
import { Component, Vue } from 'vue-property-decorator';
import * as apid from '../../../../api';

const SLOT_MIN = 30; // 30 分刻み
const ROW_PX = 30; // 30 分 = 30px
const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

interface TimeSlot {
    label: string;
    isHour: boolean;
    isDayBreak: boolean;
    dayLabel: string;
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

@Component({})
export default class TunerTimelineView extends Vue {
    public loading: boolean = true;
    public data: apid.TunerAllocations | null = null;
    public timeSlots: TimeSlot[] = [];
    public blocksByTuner: { [key: number]: Block[] } = {};
    public rowPx: number = ROW_PX;

    private reservesApiModel: IReservesApiModel = container.get<IReservesApiModel>('IReservesApiModel');
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
        return this.timeSlots.length * ROW_PX;
    }

    get dayBreakSlots(): Array<{ index: number }> {
        const result: Array<{ index: number }> = [];
        this.timeSlots.forEach((s, i) => {
            if (s.isDayBreak) result.push({ index: i });
        });
        return result;
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
        for (let i = 0; i < slotsCount; i++) {
            const m = this.startEpochMin + i * SLOT_MIN;
            const d = new Date(m * 60000);
            const hh = d.getHours();
            const mm = d.getMinutes();
            const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            const isDayBreak = dayKey !== lastDayKey;
            lastDayKey = dayKey;
            slots.push({
                label: `${this.zeroPad(hh)}:${this.zeroPad(mm)}`,
                isHour: mm === 0,
                isDayBreak,
                dayLabel: this.fmtFullDate(d),
            });
        }
        this.timeSlots = slots;

        const nowMs = now.getTime();
        const buckets: { [key: number]: Block[] } = {};
        for (const a of data.allocations) {
            const startMin = a.startAt / 60000;
            const endMin = a.endAt / 60000;
            if (endMin <= this.startEpochMin) continue;
            const clampedStart = Math.max(startMin, this.startEpochMin);
            const topMin = clampedStart - this.startEpochMin;
            const durationMin = Math.max(SLOT_MIN / 2, endMin - clampedStart);
            const isRecording = a.startAt <= nowMs && nowMs < a.endAt;
            const block: Block = {
                reserveId: a.reserveId,
                name: a.name,
                channelName: a.channelName,
                channelType: a.channelType,
                timeRange: this.formatTimeRange(a.startAt, a.endAt, nowMs),
                topPx: (topMin / SLOT_MIN) * ROW_PX,
                heightPx: (durationMin / SLOT_MIN) * ROW_PX,
                isRecording,
            };
            if (typeof buckets[a.tunerIndex] === 'undefined') buckets[a.tunerIndex] = [];
            buckets[a.tunerIndex].push(block);
        }
        this.blocksByTuner = buckets;
    }

    /** "yyyy/mm/dd (曜) hh:mm-hh:mm (xx分後 / x時間x分後)" */
    private formatTimeRange(startAt: number, endAt: number, nowMs: number): string {
        const head = `${this.fmtFullDate(new Date(startAt))} ${this.fmtHM(startAt)}-${this.fmtHM(endAt)}`;
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

.loading-area, .empty-area
    display: flex
    align-items: center
    justify-content: center
    min-height: 200px
    opacity: 0.6
    font-size: 14px

.timeline-wrap
    display: flex
    align-items: flex-start
    border: 1px solid rgba(0, 0, 0, 0.12)
    background-color: rgba(0, 0, 0, 0.02)
    overflow-x: auto

.time-axis
    flex: 0 0 130px
    border-right: 1px solid rgba(0, 0, 0, 0.12)
    background-color: rgba(0, 0, 0, 0.04)

.tuner-column
    flex: 1 0 200px
    min-width: 200px
    border-right: 1px solid rgba(0, 0, 0, 0.06)

.header
    height: 44px
    display: flex
    flex-direction: column
    align-items: center
    justify-content: center
    font-size: 14px
    font-weight: 600
    background-color: rgba(0, 0, 0, 0.06)
    border-bottom: 1px solid rgba(0, 0, 0, 0.12)
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
    color: rgba(0, 0, 0, 0.6)
    padding: 2px 8px
    border-bottom: 1px dashed rgba(0, 0, 0, 0.06)
    box-sizing: border-box
    font-size: 13px
    line-height: 1.2

    &--hour
        font-weight: 600
        color: rgba(0, 0, 0, 0.8)
        border-bottom-style: solid
        border-bottom-color: rgba(0, 0, 0, 0.12)

    &--day
        border-top: 2px solid rgba(0, 0, 0, 0.45)
        background-color: rgba(0, 0, 0, 0.05)

    .day-label
        font-size: 12px
        font-weight: 700
        color: rgba(0, 0, 0, 0.85)

    .hm-label
        font-size: 13px

.day-break-line
    position: absolute
    left: 0
    right: 0
    border-top: 2px solid rgba(0, 0, 0, 0.35)
    z-index: 0

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

    .block-channel
        opacity: 0.75
        font-size: 12px
        white-space: nowrap
        overflow: hidden
        text-overflow: ellipsis
</style>

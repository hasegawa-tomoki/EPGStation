<template>
    <v-main>
        <TitleBar title="外部ストレージ移動ジョブ"></TitleBar>
        <v-container>
            <div v-if="jobs.length === 0" class="body-1 text-center pt-8 text--disabled">ジョブはありません</div>
            <v-card v-for="job in jobs" :key="job.id" class="mb-3 pa-3">
                <div class="d-flex align-center">
                    <v-chip small label :color="statusColor(job.status)" class="mr-2">{{ statusLabel(job.status) }}</v-chip>
                    <div class="subtitle-2 flex-grow-1 text-truncate">{{ job.storageName }}{{ job.subDirectory ? ' / ' + job.subDirectory : '' }}</div>
                    <v-btn v-if="canCancel(job)" small color="error" text :loading="cancellingId === job.id" v-on:click="cancel(job)">キャンセル</v-btn>
                </div>
                <div class="caption text--secondary mt-1">
                    ID: {{ job.id }} / 作成: {{ formatTime(job.createdAt) }}
                    <span v-if="job.finishedAt">/ 完了: {{ formatTime(job.finishedAt) }}</span>
                </div>
                <v-progress-linear :value="percent(job)" height="10" class="my-2" :color="statusColor(job.status)"></v-progress-linear>
                <div class="body-2">
                    進捗: {{ job.processed }} / {{ job.total }}
                    <span v-if="job.status === 'running' && job.currentRecordedId">(処理中: id={{ job.currentRecordedId }})</span>
                    <span v-if="job.successIds.length > 0" class="ml-2">成功: {{ job.successIds.length }}</span>
                    <span v-if="job.errors.length > 0" class="ml-2 error--text">失敗: {{ job.errors.length }}</span>
                </div>
                <div v-if="job.errors.length > 0" class="caption error--text mt-1">
                    <div v-for="e in job.errors.slice(0, 5)" :key="e.recordedId">• id={{ e.recordedId }}: {{ e.message }}</div>
                    <div v-if="job.errors.length > 5">… 他 {{ job.errors.length - 5 }} 件</div>
                </div>
            </v-card>
        </v-container>
    </v-main>
</template>

<script lang="ts">
import TitleBar from '@/components/titleBar/TitleBar.vue';
import IExternalStorageApiModel from '@/model/api/externalStorage/IExternalStorageApiModel';
import container from '@/model/ModelContainer';
import ISnackbarState from '@/model/state/snackbar/ISnackbarState';
import DateUtil from '@/util/DateUtil';
import { Component, Vue } from 'vue-property-decorator';
import * as apid from '../../../api';

@Component({ components: { TitleBar } })
export default class MoveJobs extends Vue {
    public jobs: apid.ExternalStorageMoveJob[] = [];
    public cancellingId: string | null = null;

    private api = container.get<IExternalStorageApiModel>('IExternalStorageApiModel');
    private snackbar = container.get<ISnackbarState>('ISnackbarState');
    private pollTimer: number | null = null;

    public async created(): Promise<void> {
        await this.reload();
        this.startPoll();
    }

    public beforeDestroy(): void {
        this.stopPoll();
    }

    public async reload(): Promise<void> {
        try {
            const res = await this.api.listMoveJobs();
            this.jobs = res.items;
        } catch (err) {
            this.snackbar.open({ color: 'error', text: 'ジョブ一覧取得失敗' });
        }
    }

    private startPoll(): void {
        this.stopPoll();
        this.pollTimer = window.setInterval(() => {
            const hasActive = this.jobs.some(j => j.status === 'running' || j.status === 'pending');
            // 進行中があれば 2 秒間隔、無ければ 15 秒間隔 (静かに)
            if (hasActive || this.jobs.length === 0) {
                this.reload();
            }
        }, 2000);
    }

    private stopPoll(): void {
        if (this.pollTimer !== null) {
            window.clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    public percent(job: apid.ExternalStorageMoveJob): number {
        if (job.total === 0) return 0;
        return Math.round((job.processed / job.total) * 100);
    }

    public statusLabel(s: apid.ExternalStorageMoveJob['status']): string {
        switch (s) {
            case 'pending':
                return '待機中';
            case 'running':
                return '実行中';
            case 'completed':
                return '完了';
            case 'cancelled':
                return 'キャンセル';
            case 'error':
                return '失敗';
        }
        return s;
    }

    public statusColor(s: apid.ExternalStorageMoveJob['status']): string {
        switch (s) {
            case 'pending':
                return 'grey';
            case 'running':
                return 'primary';
            case 'completed':
                return 'success';
            case 'cancelled':
                return 'warning';
            case 'error':
                return 'error';
        }
        return 'grey';
    }

    public canCancel(job: apid.ExternalStorageMoveJob): boolean {
        return job.status === 'pending' || job.status === 'running';
    }

    public async cancel(job: apid.ExternalStorageMoveJob): Promise<void> {
        this.cancellingId = job.id;
        try {
            await this.api.cancelMoveJob(job.id);
            this.snackbar.open({ color: 'success', text: 'キャンセル要求を送信' });
            await this.reload();
        } catch (err: any) {
            this.snackbar.open({ color: 'error', text: `キャンセル失敗: ${err?.response?.data?.message ?? err.message ?? ''}` });
        } finally {
            this.cancellingId = null;
        }
    }

    public formatTime(ms: number | null | undefined): string {
        if (!ms) return '';
        return DateUtil.format(DateUtil.getJaDate(new Date(ms)), 'MM/dd(w) hh:mm:ss');
    }
}
</script>

import { inject, injectable } from 'inversify';
import IRecordedApiModel from '../../api/recorded/IRecordedApiModel';
import ILogger from '../../ILogger';
import ILoggerModel from '../../ILoggerModel';
import IMoveJobManager, { MoveJob, MoveJobOption } from './IMoveJobManager';

const MAX_RETAINED_JOBS = 50;

@injectable()
export default class MoveJobManager implements IMoveJobManager {
    private log: ILogger;
    private recordedApi: IRecordedApiModel;

    // 全ジョブ (古いものは MAX_RETAINED_JOBS を超えたら追い出し)
    private jobs: MoveJob[] = [];
    // 未処理キュー
    private queue: MoveJob[] = [];
    // ワーカーが回っているか
    private workerRunning = false;

    constructor(
        @inject('ILoggerModel') logger: ILoggerModel,
        @inject('IRecordedApiModel') recordedApi: IRecordedApiModel,
    ) {
        this.log = logger.getLogger();
        this.recordedApi = recordedApi;
    }

    public submit(option: MoveJobOption): MoveJob {
        const job: MoveJob = {
            id: this.generateId(),
            storageName: option.storageName,
            subDirectory: option.subDirectory ?? null,
            recordedIds: [...option.recordedIds],
            status: 'pending',
            processed: 0,
            total: option.recordedIds.length,
            currentRecordedId: null,
            successIds: [],
            errors: [],
            cancelRequested: false,
            createdAt: Date.now(),
            startedAt: null,
            finishedAt: null,
        };
        this.jobs.unshift(job);
        this.trimRetained();
        this.queue.push(job);
        this.kickWorker();
        return job;
    }

    public list(limit?: number): MoveJob[] {
        const cap = typeof limit === 'number' && limit > 0 ? limit : this.jobs.length;
        return this.jobs.slice(0, cap).map(j => ({ ...j }));
    }

    public get(id: string): MoveJob | null {
        const job = this.jobs.find(j => j.id === id);
        return typeof job === 'undefined' ? null : { ...job };
    }

    public cancel(id: string): boolean {
        const job = this.jobs.find(j => j.id === id);
        if (typeof job === 'undefined') return false;
        if (job.status === 'completed' || job.status === 'cancelled' || job.status === 'error') return false;
        job.cancelRequested = true;
        if (job.status === 'pending') {
            // キューから除去 + 即座に cancelled へ
            this.queue = this.queue.filter(q => q.id !== job.id);
            job.status = 'cancelled';
            job.finishedAt = Date.now();
        }
        return true;
    }

    private generateId(): string {
        return `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    private trimRetained(): void {
        if (this.jobs.length > MAX_RETAINED_JOBS) {
            this.jobs.length = MAX_RETAINED_JOBS;
        }
    }

    private kickWorker(): void {
        if (this.workerRunning) return;
        this.workerRunning = true;
        this.runWorker().catch(err => {
            this.log.system.error('moveJob worker crashed');
            this.log.system.error(err);
            this.workerRunning = false;
        });
    }

    private async runWorker(): Promise<void> {
        while (this.queue.length > 0) {
            const job = this.queue.shift()!;
            if (job.cancelRequested) {
                job.status = 'cancelled';
                job.finishedAt = Date.now();
                continue;
            }
            job.status = 'running';
            job.startedAt = Date.now();
            this.log.system.info(`moveJob ${job.id} start total=${job.total}`);
            for (const recordedId of job.recordedIds) {
                if (job.cancelRequested) {
                    this.log.system.info(`moveJob ${job.id} cancelled at ${job.processed}/${job.total}`);
                    break;
                }
                job.currentRecordedId = recordedId;
                try {
                    await this.recordedApi.moveToExternalStorage({
                        recordedId,
                        storageName: job.storageName,
                        subDirectory: job.subDirectory,
                    });
                    job.successIds.push(recordedId);
                } catch (err: any) {
                    const message = err?.message ?? String(err);
                    job.errors.push({ recordedId, message });
                    this.log.system.error(`moveJob ${job.id} recordedId=${recordedId} failed: ${message}`);
                }
                job.processed++;
            }
            job.currentRecordedId = null;
            job.finishedAt = Date.now();
            if (job.cancelRequested) {
                job.status = 'cancelled';
            } else if (job.errors.length > 0 && job.successIds.length === 0) {
                job.status = 'error';
            } else {
                job.status = 'completed';
            }
            this.log.system.info(
                `moveJob ${job.id} done status=${job.status} success=${job.successIds.length} errors=${job.errors.length}`,
            );
        }
        this.workerRunning = false;
    }
}

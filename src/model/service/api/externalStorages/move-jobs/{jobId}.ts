import { Operation } from 'express-openapi';
import IMoveJobManager, { MoveJob } from '../../../externalStorageMove/IMoveJobManager';
import container from '../../../../ModelContainer';
import * as api from '../../../api';

function toApi(job: MoveJob): any {
    return {
        id: job.id,
        storageName: job.storageName,
        subDirectory: job.subDirectory,
        recordedIds: job.recordedIds,
        status: job.status,
        processed: job.processed,
        total: job.total,
        currentRecordedId: job.currentRecordedId,
        successIds: job.successIds,
        errors: job.errors,
        cancelRequested: job.cancelRequested,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        finishedAt: job.finishedAt,
    };
}

export const get: Operation = async (req, res) => {
    const manager = container.get<IMoveJobManager>('IMoveJobManager');
    try {
        const job = manager.get(req.params.jobId);
        if (job === null) {
            api.responseServerError(res, 'JobNotFound');
            return;
        }
        api.responseJSON(res, 200, toApi(job));
    } catch (err: any) {
        api.responseServerError(res, err.message);
    }
};

get.apiDoc = {
    summary: '外部ストレージ移動ジョブ詳細',
    tags: ['externalStorages'],
    parameters: [{ in: 'path', name: 'jobId', required: true, schema: { type: 'string' } }],
    responses: {
        200: {
            description: '取得成功',
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/ExternalStorageMoveJob' },
                },
            },
        },
        default: {
            description: '予期しないエラー',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
    },
};

// DELETE = キャンセル
export const del: Operation = async (req, res) => {
    const manager = container.get<IMoveJobManager>('IMoveJobManager');
    try {
        const ok = manager.cancel(req.params.jobId);
        if (!ok) {
            api.responseServerError(res, 'CancelFailed');
            return;
        }
        api.responseJSON(res, 200, { code: 200 });
    } catch (err: any) {
        api.responseServerError(res, err.message);
    }
};

del.apiDoc = {
    summary: '外部ストレージ移動ジョブキャンセル',
    tags: ['externalStorages'],
    parameters: [{ in: 'path', name: 'jobId', required: true, schema: { type: 'string' } }],
    responses: {
        200: { description: 'キャンセル済み' },
        default: {
            description: '予期しないエラー',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
    },
};

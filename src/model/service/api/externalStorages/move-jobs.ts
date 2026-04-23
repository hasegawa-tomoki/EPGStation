import { Operation } from 'express-openapi';
import IMoveJobManager from '../../externalStorageMove/IMoveJobManager';
import container from '../../../ModelContainer';
import * as api from '../../api';

function toApi(job: import('../../externalStorageMove/IMoveJobManager').MoveJob): any {
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

export const post: Operation = async (req, res) => {
    const manager = container.get<IMoveJobManager>('IMoveJobManager');
    try {
        const body = req.body ?? {};
        if (!Array.isArray(body.recordedIds) || body.recordedIds.length === 0) {
            api.responseServerError(res, 'recordedIds is required');
            return;
        }
        if (typeof body.storageName !== 'string' || body.storageName.length === 0) {
            api.responseServerError(res, 'storageName is required');
            return;
        }
        const job = manager.submit({
            recordedIds: body.recordedIds,
            storageName: body.storageName,
            subDirectory:
                typeof body.subDirectory === 'string' && body.subDirectory.length > 0 ? body.subDirectory : null,
        });
        api.responseJSON(res, 200, toApi(job));
    } catch (err: any) {
        api.responseServerError(res, err.message);
    }
};

post.apiDoc = {
    summary: '外部ストレージへの一括移動ジョブ投入',
    tags: ['externalStorages'],
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: { $ref: '#/components/schemas/ExternalStorageMoveJobSubmitOption' },
            },
        },
    },
    responses: {
        200: {
            description: 'ジョブ登録成功',
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

export const get: Operation = async (_req, res) => {
    const manager = container.get<IMoveJobManager>('IMoveJobManager');
    try {
        const jobs = manager.list(50).map(toApi);
        api.responseJSON(res, 200, { items: jobs });
    } catch (err: any) {
        api.responseServerError(res, err.message);
    }
};

get.apiDoc = {
    summary: '外部ストレージ移動ジョブ一覧',
    tags: ['externalStorages'],
    responses: {
        200: {
            description: '取得成功',
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/ExternalStorageMoveJobList' },
                },
            },
        },
        default: {
            description: '予期しないエラー',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
    },
};

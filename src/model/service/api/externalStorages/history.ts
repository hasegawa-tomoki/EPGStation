import { Operation } from 'express-openapi';
import IExternalStorageApiModel from '../../../api/externalStorage/IExternalStorageApiModel';
import container from '../../../ModelContainer';
import * as api from '../../api';

export const get: Operation = async (req, res) => {
    const externalStorageApiModel = container.get<IExternalStorageApiModel>('IExternalStorageApiModel');

    try {
        const limitRaw = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 10;
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : 10;
        const history = await externalStorageApiModel.getHistory(limit);
        api.responseJSON(res, 200, history);
    } catch (err: any) {
        api.responseServerError(res, err.message);
    }
};

get.apiDoc = {
    summary: '外部ストレージ移動の履歴一覧',
    tags: ['externalStorages'],
    description: 'Recorded.externalPath を集計して最近の移動先 {storageName, subDirectory} を新しい順で返す',
    parameters: [
        {
            in: 'query',
            name: 'limit',
            required: false,
            schema: { type: 'integer', minimum: 1, maximum: 50, default: 10 },
        },
    ],
    responses: {
        200: {
            description: '履歴取得成功',
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/ExternalStorageMoveHistory' },
                },
            },
        },
        default: {
            description: '予期しないエラー',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
    },
};

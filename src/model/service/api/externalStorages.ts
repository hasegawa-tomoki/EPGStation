import { Operation } from 'express-openapi';
import IExternalStorageApiModel from '../../api/externalStorage/IExternalStorageApiModel';
import container from '../../ModelContainer';
import * as api from '../api';

export const get: Operation = async (_req, res) => {
    const externalStorageApiModel = container.get<IExternalStorageApiModel>('IExternalStorageApiModel');

    try {
        const list = externalStorageApiModel.getList();
        api.responseJSON(res, 200, list);
    } catch (err: any) {
        api.responseServerError(res, err.message);
    }
};

get.apiDoc = {
    summary: '外部ストレージ一覧取得',
    tags: ['externalStorages'],
    description: 'config.yml に設定された外部ストレージの一覧を返す',
    responses: {
        200: {
            description: '外部ストレージ一覧を取得しました',
            content: {
                'application/json': {
                    schema: {
                        $ref: '#/components/schemas/ExternalStorageList',
                    },
                },
            },
        },
        default: {
            description: '予期しないエラー',
            content: {
                'application/json': {
                    schema: {
                        $ref: '#/components/schemas/Error',
                    },
                },
            },
        },
    },
};

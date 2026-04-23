import { Operation } from 'express-openapi';
import IExternalStorageApiModel from '../../../../api/externalStorage/IExternalStorageApiModel';
import container from '../../../../ModelContainer';
import * as api from '../../../api';

export const get: Operation = async (req, res) => {
    const externalStorageApiModel = container.get<IExternalStorageApiModel>('IExternalStorageApiModel');

    try {
        const subPath = typeof req.query.subPath === 'string' ? req.query.subPath : '';
        const list = await externalStorageApiModel.getFiles(req.params.storageName, subPath);
        api.responseJSON(res, 200, list);
    } catch (err: any) {
        api.responseServerError(res, err.message);
    }
};

get.apiDoc = {
    summary: '外部ストレージのディレクトリ配下一覧取得',
    tags: ['externalStorages'],
    description: '指定外部ストレージの subPath 配下のファイル/ディレクトリ + 紐付く録画情報を返す',
    parameters: [
        {
            in: 'path',
            name: 'storageName',
            required: true,
            schema: { type: 'string' },
        },
        {
            in: 'query',
            name: 'subPath',
            required: false,
            schema: { type: 'string' },
        },
    ],
    responses: {
        200: {
            description: '一覧取得成功',
            content: {
                'application/json': {
                    schema: {
                        $ref: '#/components/schemas/ExternalStorageFileList',
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

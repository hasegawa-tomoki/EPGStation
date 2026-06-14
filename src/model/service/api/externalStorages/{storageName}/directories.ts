import { Operation } from 'express-openapi';
import IExternalStorageApiModel from '../../../../api/externalStorage/IExternalStorageApiModel';
import container from '../../../../ModelContainer';
import * as api from '../../../api';

export const get: Operation = async (req, res) => {
    const externalStorageApiModel = container.get<IExternalStorageApiModel>('IExternalStorageApiModel');

    try {
        const depthRaw = typeof req.query.depth === 'string' ? parseInt(req.query.depth, 10) : 2;
        const depth = Number.isFinite(depthRaw) && depthRaw > 0 ? depthRaw : 2;
        const list = await externalStorageApiModel.getDirectories(req.params.storageName, depth);
        api.responseJSON(res, 200, list);
    } catch (err: any) {
        api.responseServerError(res, err.message);
    }
};

get.apiDoc = {
    summary: '外部ストレージのディレクトリ候補一覧取得',
    tags: ['externalStorages'],
    description:
        '指定外部ストレージ root 配下のディレクトリを最大 depth 階層まで列挙し、相対パスの一覧を返す (移動先サブディレクトリの候補表示用)',
    parameters: [
        {
            in: 'path',
            name: 'storageName',
            required: true,
            schema: { type: 'string' },
        },
        {
            in: 'query',
            name: 'depth',
            required: false,
            description: '列挙する最大階層 (省略時 2, 最大 5)',
            schema: { type: 'integer' },
        },
    ],
    responses: {
        200: {
            description: '一覧取得成功',
            content: {
                'application/json': {
                    schema: {
                        $ref: '#/components/schemas/ExternalStorageDirectoryList',
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

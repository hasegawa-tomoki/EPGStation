import { Operation } from 'express-openapi';
import IExternalStorageApiModel from '../../../../api/externalStorage/IExternalStorageApiModel';
import container from '../../../../ModelContainer';
import * as api from '../../../api';

export const post: Operation = async (req, res) => {
    const externalStorageApiModel = container.get<IExternalStorageApiModel>('IExternalStorageApiModel');

    try {
        const body = req.body ?? {};
        await externalStorageApiModel.rename(req.params.storageName, body.subPath ?? '', body.newName ?? '');
        api.responseJSON(res, 200, { code: 200 });
    } catch (err: any) {
        api.responseServerError(res, err.message);
    }
};

post.apiDoc = {
    summary: '外部ストレージ上のファイル/ディレクトリをリネーム',
    tags: ['externalStorages'],
    description: '指定 subPath の basename を newName に置き換える (同ディレクトリ内のみ)',
    parameters: [
        {
            in: 'path',
            name: 'storageName',
            required: true,
            schema: { type: 'string' },
        },
    ],
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: {
                    $ref: '#/components/schemas/RenameExternalStorageOption',
                },
            },
        },
    },
    responses: {
        200: { description: 'リネーム成功' },
        default: {
            description: '予期しないエラー',
            content: {
                'application/json': {
                    schema: { $ref: '#/components/schemas/Error' },
                },
            },
        },
    },
};

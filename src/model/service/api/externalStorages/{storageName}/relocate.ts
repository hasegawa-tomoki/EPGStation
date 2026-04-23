import { Operation } from 'express-openapi';
import IExternalStorageApiModel from '../../../../api/externalStorage/IExternalStorageApiModel';
import container from '../../../../ModelContainer';
import * as api from '../../../api';

export const post: Operation = async (req, res) => {
    const model = container.get<IExternalStorageApiModel>('IExternalStorageApiModel');
    try {
        const body = req.body ?? {};
        await model.relocate(req.params.storageName, body.subPath ?? '', body.targetDir ?? '');
        api.responseJSON(res, 200, { code: 200 });
    } catch (err: any) {
        api.responseServerError(res, err.message);
    }
};

post.apiDoc = {
    summary: '外部ストレージ内のファイルを別ディレクトリへ移動',
    tags: ['externalStorages'],
    parameters: [{ in: 'path', name: 'storageName', required: true, schema: { type: 'string' } }],
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: { $ref: '#/components/schemas/ExternalStorageRelocateOption' },
            },
        },
    },
    responses: {
        200: { description: '移動成功' },
        default: {
            description: '予期しないエラー',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
        },
    },
};

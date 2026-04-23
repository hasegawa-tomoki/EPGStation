import { Operation } from 'express-openapi';
import IRecordedApiModel from '../../../../api/recorded/IRecordedApiModel';
import container from '../../../../ModelContainer';
import * as api from '../../../api';

export const post: Operation = async (req, res) => {
    const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');

    try {
        const body = req.body ?? {};
        await recordedApiModel.moveToExternalStorage({
            recordedId: parseInt(req.params.recordedId, 10),
            storageName: body.storageName,
            subDirectory: typeof body.subDirectory === 'string' ? body.subDirectory : null,
        });
        api.responseJSON(res, 200, { code: 200 });
    } catch (err: any) {
        api.responseServerError(res, err.message);
    }
};

post.apiDoc = {
    summary: '録画を外部ストレージへ移動',
    tags: ['recorded'],
    description:
        '録画ファイル一式 (TS / エンコード済 / サムネイル) を外部ストレージへ物理移動し、externalPath を設定する',
    parameters: [
        {
            $ref: '#/components/parameters/PathRecordedId',
        },
    ],
    requestBody: {
        required: true,
        content: {
            'application/json': {
                schema: {
                    $ref: '#/components/schemas/MoveToExternalStorageOption',
                },
            },
        },
    },
    responses: {
        200: {
            description: '外部ストレージへの移動が完了しました',
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

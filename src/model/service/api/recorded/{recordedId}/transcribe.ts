import { Operation } from 'express-openapi';
import IRecordedApiModel from '../../../../api/recorded/IRecordedApiModel';
import container from '../../../../ModelContainer';
import * as api from '../../../api';

export const post: Operation = async (req, res) => {
    const recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');

    try {
        await recordedApiModel.requestTranscribe(parseInt(req.params.recordedId, 10));
        api.responseJSON(res, 200, { code: 200 });
    } catch (err: any) {
        if (err.message === 'RecordedIsNull' || err.message === 'VideoFileNotFound' || err.message === 'VideoFilePathNotFound') {
            api.responseError(res, { code: 404, message: err.message });
            return;
        }
        api.responseServerError(res, err.message);
    }
};

post.apiDoc = {
    summary: '録画の文字起こしを要求',
    tags: ['recorded'],
    description: '録画の transcribe フラグを true にし、transcribe サービスへ文字起こしジョブを投入する',
    parameters: [
        {
            $ref: '#/components/parameters/PathRecordedId',
        },
    ],
    responses: {
        200: {
            description: '文字起こしジョブを投入しました',
        },
        404: {
            description: '対象の録画またはビデオファイルが見つかりません',
            content: {
                'application/json': {
                    schema: {
                        $ref: '#/components/schemas/Error',
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

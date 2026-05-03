import { Operation } from 'express-openapi';
import * as fs from 'fs';
import * as path from 'path';
import * as api from '../../../api';

const TRANSCRIPT_DIR = process.env['TRANSCRIPT_DIR'] || '/app/data/transcripts';

export const get: Operation = async (req, res) => {
    const recordedId = parseInt(req.params.recordedId, 10);
    if (Number.isNaN(recordedId) || recordedId <= 0) {
        api.responseError(res, { code: 400, message: 'invalid recordedId' });
        return;
    }

    const filePath = path.join(TRANSCRIPT_DIR, `${recordedId}.txt`);
    try {
        const data = await fs.promises.readFile(filePath, 'utf-8');
        res.status(200);
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(data);
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            api.responseError(res, { code: 404, message: 'transcript not found' });
            return;
        }
        api.responseServerError(res, err.message);
    }
};

get.apiDoc = {
    summary: '録画の文字起こしテキストを取得',
    tags: ['recorded'],
    description: 'transcribe サービスが生成した文字起こしファイル (時刻付き逐語) を text/plain で返す',
    parameters: [
        {
            $ref: '#/components/parameters/PathRecordedId',
        },
    ],
    produces: ['text/plain'],
    responses: {
        200: {
            description: '文字起こしテキスト',
            content: {
                'text/plain': {
                    schema: {
                        type: 'string',
                    },
                },
            },
        },
        404: {
            description: '文字起こしファイルが存在しません',
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

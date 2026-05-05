import { Operation } from 'express-openapi';
import IReserveApiModel from '../../../api/reserve/IReserveApiModel';
import container from '../../../ModelContainer';
import * as api from '../../api';

export const get: Operation = async (req, res) => {
    const reserveApiModel = container.get<IReserveApiModel>('IReserveApiModel');

    try {
        const isHalfWidth = req.query.isHalfWidth === 'true' || (req.query.isHalfWidth as any) === true;
        api.responseJSON(res, 200, await reserveApiModel.getTunerAllocations(isHalfWidth));
    } catch (err: any) {
        api.responseServerError(res, err.message);
    }
};

get.apiDoc = {
    summary: 'チューナー使用状況取得',
    tags: ['reserves'],
    description: '各チューナーがどの予約をどの時間帯占有するかをシミュレーションして返す',
    parameters: [
        {
            $ref: '#/components/parameters/IsHalfWidth',
        },
    ],
    responses: {
        200: {
            description: 'チューナー使用状況を取得しました',
            content: {
                'application/json': {
                    schema: {
                        $ref: '#/components/schemas/TunerAllocations',
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

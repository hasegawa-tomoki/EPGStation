import { inject, injectable } from 'inversify';
import * as apid from '../../../../../api';
import IRepositoryModel from '../IRepositoryModel';
import IExternalStorageApiModel from './IExternalStorageApiModel';

@injectable()
export default class ExternalStorageApiModel implements IExternalStorageApiModel {
    private repository: IRepositoryModel;

    constructor(@inject('IRepositoryModel') repository: IRepositoryModel) {
        this.repository = repository;
    }

    public async getList(): Promise<apid.ExternalStorageList> {
        const result = await this.repository.get('/externalStorages');

        return result.data;
    }
}

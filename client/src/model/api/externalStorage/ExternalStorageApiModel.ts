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

    public async getFiles(storageName: string, subPath: string): Promise<apid.ExternalStorageFileList> {
        const result = await this.repository.get(`/externalStorages/${encodeURIComponent(storageName)}/files`, {
            params: { subPath },
        });

        return result.data;
    }

    public async rename(storageName: string, option: apid.RenameExternalStorageOption): Promise<void> {
        await this.repository.post(`/externalStorages/${encodeURIComponent(storageName)}/rename`, option);
    }

    public async getHistory(limit: number = 10): Promise<apid.ExternalStorageMoveHistory> {
        const result = await this.repository.get('/externalStorages/history', { params: { limit } });
        return result.data;
    }

    public async submitMoveJob(option: apid.ExternalStorageMoveJobSubmitOption): Promise<apid.ExternalStorageMoveJob> {
        const result = await this.repository.post('/externalStorages/move-jobs', option);
        return result.data;
    }

    public async listMoveJobs(): Promise<apid.ExternalStorageMoveJobList> {
        const result = await this.repository.get('/externalStorages/move-jobs');
        return result.data;
    }

    public async getMoveJob(jobId: string): Promise<apid.ExternalStorageMoveJob> {
        const result = await this.repository.get(`/externalStorages/move-jobs/${encodeURIComponent(jobId)}`);
        return result.data;
    }

    public async cancelMoveJob(jobId: string): Promise<void> {
        await this.repository.delete(`/externalStorages/move-jobs/${encodeURIComponent(jobId)}`);
    }
}

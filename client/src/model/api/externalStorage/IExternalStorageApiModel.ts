import * as apid from '../../../../../api';

export default interface IExternalStorageApiModel {
    getList(): Promise<apid.ExternalStorageList>;
    getFiles(storageName: string, subPath: string): Promise<apid.ExternalStorageFileList>;
    rename(storageName: string, option: apid.RenameExternalStorageOption): Promise<void>;
    getHistory(limit?: number): Promise<apid.ExternalStorageMoveHistory>;
    submitMoveJob(option: apid.ExternalStorageMoveJobSubmitOption): Promise<apid.ExternalStorageMoveJob>;
    listMoveJobs(): Promise<apid.ExternalStorageMoveJobList>;
    getMoveJob(jobId: string): Promise<apid.ExternalStorageMoveJob>;
    cancelMoveJob(jobId: string): Promise<void>;
}

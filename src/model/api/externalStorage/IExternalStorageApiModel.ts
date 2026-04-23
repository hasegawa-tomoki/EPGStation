import * as apid from '../../../../api';

export default interface IExternalStorageApiModel {
    getList(): apid.ExternalStorageList;
    getFiles(storageName: string, subPath: string): Promise<apid.ExternalStorageFileList>;
    rename(storageName: string, subPath: string, newName: string): Promise<void>;
    mkdir(storageName: string, parentSubPath: string, folderName: string): Promise<void>;
    relocate(storageName: string, subPath: string, targetDir: string): Promise<void>;
    getHistory(limit: number): Promise<apid.ExternalStorageMoveHistory>;
}

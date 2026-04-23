import * as apid from '../../../../api';

export default interface IExternalStorageApiModel {
    getList(): apid.ExternalStorageList;
    getFiles(storageName: string, subPath: string): Promise<apid.ExternalStorageFileList>;
    rename(storageName: string, subPath: string, newName: string): Promise<void>;
}

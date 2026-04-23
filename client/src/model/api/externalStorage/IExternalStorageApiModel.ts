import * as apid from '../../../../../api';

export default interface IExternalStorageApiModel {
    getList(): Promise<apid.ExternalStorageList>;
}

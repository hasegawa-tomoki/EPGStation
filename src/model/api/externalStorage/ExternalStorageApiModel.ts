import { inject, injectable } from 'inversify';
import * as apid from '../../../../api';
import IConfigFile from '../../IConfigFile';
import IConfiguration from '../../IConfiguration';
import IExternalStorageApiModel from './IExternalStorageApiModel';

@injectable()
export default class ExternalStorageApiModel implements IExternalStorageApiModel {
    private config: IConfigFile;

    constructor(@inject('IConfiguration') configuration: IConfiguration) {
        this.config = configuration.getConfig();
    }

    /**
     * 設定された外部ストレージの一覧を返す
     */
    public getList(): apid.ExternalStorageList {
        const items: apid.ExternalStorageItem[] = (this.config.externalStorage ?? []).map(s => {
            return { name: s.name, path: s.path };
        });
        return { items };
    }
}

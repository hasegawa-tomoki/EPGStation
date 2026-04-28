import { inject, injectable } from 'inversify';
import AbstractStorageBaseModel from '../AbstractStorageBaseModel';
import IStorageOperationModel from '../IStorageOperationModel';
import { IGuideProgramDialogSettingStorageModel, IGuideProgramDialogSettingValue } from './IGuideProgramDialogSettingStorageModel';

@injectable()
export default class GuideProgramDialogSettingStorageModel extends AbstractStorageBaseModel<IGuideProgramDialogSettingValue> implements IGuideProgramDialogSettingStorageModel {
    constructor(@inject('IStorageOperationModel') op: IStorageOperationModel) {
        super(op);
    }

    public getDefaultValue(): IGuideProgramDialogSettingValue {
        return {
            encode: 'H.264',
            isDeleteOriginalAfterEncode: true,
        };
    }

    public getStorageKey(): string {
        // V2: 旧デフォルト (TS / false) を残している既存ブラウザにも新デフォルトを反映させるため key を変更
        return 'GuideProgramDetailSettingV2';
    }
}

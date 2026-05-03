import * as apid from '../../../../api';
import { MoveToExternalStorageOption, UploadedVideoFileOption } from '../../operator/recorded/IRecordedManageModel';

export default interface IRecordedApiModel {
    gets(option: apid.GetRecordedOption): Promise<apid.Records>;
    get(recordedId: apid.RecordedId, isHalfWidth: boolean): Promise<apid.RecordedItem | null>;
    getSearchOptionList(): Promise<apid.RecordedSearchOptions>;
    delete(recordedId: apid.RecordedId): Promise<void>;
    stopEncode(recordedId: apid.RecordedId): Promise<void>;
    changeProtect(recordedId: apid.RecordedId, isProtect: boolean): Promise<void>;
    fileCleanup(): Promise<void>;
    addUploadedVideoFile(option: UploadedVideoFileOption): Promise<void>;
    createNewRecorded(option: apid.CreateNewRecordedOption): Promise<apid.RecordedId>;
    moveToExternalStorage(option: MoveToExternalStorageOption): Promise<void>;
    requestTranscribe(recordedId: apid.RecordedId): Promise<void>;
}

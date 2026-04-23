import * as apid from '../../../api';
import Recorded from '../../db/entities/Recorded';
import { EncodeRecordedIdIndex } from '../service/encode/IEncodeManageModel';

export type RuleKeywordIndex = { [ruleId: number]: string | null };

export default interface IRecordedItemUtil {
    convertRecordedToRecordedItem(
        recorded: Recorded,
        isHalfWidth: boolean,
        encodeIndex?: EncodeRecordedIdIndex,
        ruleKeywordIndex?: RuleKeywordIndex,
    ): apid.RecordedItem;
}

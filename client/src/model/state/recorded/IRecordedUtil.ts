import * as apid from '../../../../../api';

export interface RecordedDisplayData {
    display: {
        channelName: string;
        name: string;
        time: string;
        shortTime: string;
        duration: number;
        description?: string;
        extended?: string;
        genre?: string;
        topThumbnailPath: string;
        thumbnails?: apid.ThumbnailId[];
        videoFiles?: apid.VideoFile[];
        canStremingVideoFiles?: apid.VideoFile[];
        drop?: string;
        dropSimple?: string;
        hasDrop: boolean;
        ruleId?: apid.RuleId;
        ruleName?: string;
        isExternal: boolean;
        externalPath?: string;
    };
    recordedItem: apid.RecordedItem;
    isSelected: boolean;
}

export default interface IRecordedUtil {
    convertRecordedItemToDisplayData(item: apid.RecordedItem, isHalfWidth: boolean): RecordedDisplayData;
}

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
        createdUser?: string; // 録画作成ユーザー (trusted/未認証は未定義 = 表示しない)
        hasMissingFile?: boolean; // videoFile のいずれかで実ファイルが見つからない場合 true
    };
    recordedItem: apid.RecordedItem;
    isSelected: boolean;
}

export default interface IRecordedUtil {
    convertRecordedItemToDisplayData(item: apid.RecordedItem, isHalfWidth: boolean): RecordedDisplayData;
}

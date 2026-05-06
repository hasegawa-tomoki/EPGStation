import * as fs from 'fs';
import * as path from 'path';
import { inject, injectable } from 'inversify';
import * as apid from '../../../api';
import Recorded from '../../db/entities/Recorded';
import VideoFileEntity from '../../db/entities/VideoFile';
import IConfigFile from '../IConfigFile';
import IConfiguration from '../IConfiguration';
import { EncodeRecordedIdIndex } from '../service/encode/IEncodeManageModel';
import IRecordedItemUtil, { RuleKeywordIndex } from './IRecordedItemUtil';

@injectable()
export default class RecordedItemUtil implements IRecordedItemUtil {
    private config: IConfigFile;

    constructor(@inject('IConfiguration') configuration: IConfiguration) {
        this.config = configuration.getConfig();
    }

    /** VideoUtil と同じロジックでフルパス解決 (RecordedItemUtil 単体で完結させるためコピー) */
    private resolveFullPath(v: VideoFileEntity): string | null {
        if (typeof v.externalStorageName === 'string' && v.externalStorageName.length > 0) {
            const ext = (this.config.externalStorage ?? []).find(s => s.name === v.externalStorageName);
            if (typeof ext === 'undefined') return null;
            return path.join(ext.path, v.filePath);
        }
        if (v.parentDirectoryName === 'tmp' && typeof this.config.recordedTmp !== 'undefined') {
            return path.join(this.config.recordedTmp, v.filePath);
        }
        for (const r of this.config.recorded) {
            if (r.name === v.parentDirectoryName) {
                return path.join(r.path, v.filePath);
            }
        }
        return null;
    }

    /**
     * Recorded を RecordedItem に変換する
     * @param recorded: Recorded
     * @param isHalfWidth isHalfWidth
     * @param encodeIndex エンコード中判定用 index
     * @param ruleKeywordIndex ruleId → keyword の事前ルックアップ (API 呼び出し側が bulk 取得)
     */
    public convertRecordedToRecordedItem(
        recorded: Recorded,
        isHalfWidth: boolean,
        encodeIndex: EncodeRecordedIdIndex = {},
        ruleKeywordIndex: RuleKeywordIndex = {},
    ): apid.RecordedItem {
        const item: apid.RecordedItem = {
            id: recorded.id,
            channelId: recorded.channelId,
            startAt: recorded.startAt,
            endAt: recorded.endAt,
            name: isHalfWidth === true ? recorded.halfWidthName : recorded.name,
            isRecording: recorded.isRecording,
            isEncoding: typeof encodeIndex[recorded.id] !== 'undefined',
            isProtected: recorded.isProtected,
        };

        if (recorded.ruleId !== null && typeof recorded.ruleId !== 'undefined') {
            item.ruleId = recorded.ruleId;
            const keyword = ruleKeywordIndex[recorded.ruleId];
            if (typeof keyword === 'string' && keyword.length > 0) {
                item.ruleName = keyword;
            }
        }

        if (typeof recorded.externalPath === 'string' && recorded.externalPath.length > 0) {
            item.externalPath = recorded.externalPath;
        }

        if (recorded.programId !== null) {
            item.programId = recorded.programId;
        }

        if (recorded.description !== null) {
            if (isHalfWidth === true) {
                if (typeof recorded.halfWidthDescription === 'string') {
                    item.description = recorded.halfWidthDescription;
                }
            } else {
                item.description = recorded.description;
            }
        }

        if (recorded.extended !== null) {
            if (isHalfWidth === true) {
                if (typeof recorded.halfWidthExtended === 'string') {
                    item.extended = recorded.halfWidthExtended;
                }
            } else {
                item.extended = recorded.extended;
            }
        }

        if (recorded.rawExtended !== null) {
            if (isHalfWidth === true) {
                if (typeof recorded.rawHalfWidthExtended === 'string') {
                    item.rawExtended = JSON.parse(recorded.rawHalfWidthExtended);
                } else {
                    item.rawExtended = JSON.parse(recorded.rawExtended);
                }
            }
        }

        if (recorded.genre1 !== null) {
            item.genre1 = recorded.genre1;
        }

        if (recorded.subGenre1 !== null) {
            item.subGenre1 = recorded.subGenre1;
        }

        if (recorded.genre2 !== null) {
            item.genre2 = recorded.genre2;
        }

        if (recorded.subGenre2 !== null) {
            item.subGenre2 = recorded.subGenre2;
        }

        if (recorded.genre3 !== null) {
            item.genre3 = recorded.genre3;
        }

        if (recorded.subGenre3 !== null) {
            item.subGenre3 = recorded.subGenre3;
        }

        if (recorded.videoType !== null) {
            item.videoType = <any>recorded.videoType;
        }

        if (recorded.videoResolution !== null) {
            item.videoResolution = <any>recorded.videoResolution;
        }

        if (recorded.videoStreamContent !== null) {
            item.videoStreamContent = recorded.videoStreamContent;
        }

        if (recorded.videoComponentType !== null) {
            item.videoComponentType = recorded.videoComponentType;
        }

        if (recorded.audioSamplingRate !== null) {
            item.audioSamplingRate = <any>recorded.audioSamplingRate;
        }

        if (recorded.audioComponentType !== null) {
            item.audioComponentType = recorded.audioComponentType;
        }

        if (typeof recorded.thumbnails !== 'undefined') {
            item.thumbnails = recorded.thumbnails.map(t => {
                return t.id;
            });
        }

        if (typeof recorded.videoFiles !== 'undefined') {
            item.videoFiles = recorded.videoFiles.map(v => {
                const out: apid.VideoFile = {
                    id: v.id,
                    name: v.name,
                    filename: path.basename(v.filePath),
                    type: v.type as apid.VideoFileType,
                    size: v.size,
                };
                const full = this.resolveFullPath(v);
                if (full === null || !fs.existsSync(full)) {
                    out.isMissing = true;
                }
                return out;
            });
        }

        if (typeof recorded.dropLogFile !== 'undefined' && recorded.dropLogFile !== null) {
            item.dropLogFile = {
                id: recorded.dropLogFile.id,
                errorCnt: recorded.dropLogFile.errorCnt,
                dropCnt: recorded.dropLogFile.dropCnt,
                scramblingCnt: recorded.dropLogFile.scramblingCnt,
            };
        }

        if (typeof recorded.tags !== 'undefined') {
            item.tags = recorded.tags.map(t => {
                return {
                    id: t.id,
                    name: t.name,
                    color: t.color,
                };
            });
        }

        if (typeof recorded.createdUser === 'string' && recorded.createdUser.length > 0) {
            item.createdUser = recorded.createdUser;
        }
        if (recorded.transcribe) {
            item.transcribe = true;
        }

        return item;
    }
}

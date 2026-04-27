<template>
    <v-main>
        <EditTitleBar
            v-if="isEditMode === true"
            :title="selectedTitle"
            :isEditMode.sync="isEditMode"
            :enableMoveExternal="true"
            v-on:exit="onFinishEdit"
            v-on:selectall="onSelectAll"
            v-on:delete="onMultiplueDeletion"
            v-on:moveExternal="onBulkMoveExternal"
        ></EditTitleBar>
        <TitleBar v-else title="録画済み">
            <template v-slot:menu>
                <v-btn v-if="settingValue !== null" icon v-on:click="toggleTableMode" :title="settingValue.isShowTableMode ? 'カード表示に切替' : 'リスト表示に切替'">
                    <v-icon>{{ settingValue.isShowTableMode ? 'mdi-view-grid-outline' : 'mdi-format-list-bulleted' }}</v-icon>
                </v-btn>
                <RecordedSearchMenu></RecordedSearchMenu>
                <RecordedMainMenu v-on:edit="onEdit" v-on:cleanup="onCleanup"></RecordedMainMenu>
            </template>
        </TitleBar>
        <transition name="page">
            <div v-if="settingValue !== null && recordedState.getRecorded().length > 0" ref="appContent" class="app-content pa-1">
                <div v-bind:style="contentWrapStyle">
                    <RecordedItems
                        :recorded="recordedState.getRecorded()"
                        v-on:detail="gotoDetail"
                        v-on:stopEncode="stopEncode"
                        v-on:selected="selectItem"
                        :isTableMode="settingValue.isShowTableMode === true"
                        :isEditMode.sync="isEditMode"
                        :isShowDropInfo="settingValue.isShowDropInfoInsteadOfDescription"
                    ></RecordedItems>
                    <Pagination v-if="isEditMode === false" :total="recordedState.getTotal()" :pageSize="settingValue.recordedLength"></Pagination>
                    <div style="visibility: hidden">dummy</div>
                </div>
            </div>
        </transition>
        <RecordedMultipleDeletionDialog
            v-if="isEditMode === true"
            :isOpen.sync="isOpenMultiplueDeletionDialog"
            :total="recordedState.getSelectedCnt().cnt"
            v-on:delete="onExecuteMultiplueDeletion"
        ></RecordedMultipleDeletionDialog>
        <MoveToExternalDialog :isOpen.sync="isOpenMoveExternalDialog" :recordedItems="bulkMoveItems" v-on:moved="onBulkMoved"></MoveToExternalDialog>
        <RecordedCleanupDialog :isOpen.sync="isOpenCleanupDialog"></RecordedCleanupDialog>
    </v-main>
</template>

<script lang="ts">
import Pagination from '@/components/pagination/Pagination.vue';
import RecordedCleanupDialog from '@/components/recorded/RecordedCleanupDialog.vue';
import MoveToExternalDialog from '@/components/recorded/MoveToExternalDialog.vue';
import RecordedItems from '@/components/recorded/RecordedItems.vue';
import RecordedMainMenu from '@/components/recorded/RecordedMainMenu.vue';
import RecordedMultipleDeletionDialog from '@/components/recorded/RecordedMultipleDeletionDialog.vue';
import RecordedSearchMenu from '@/components/recorded/RecordedSearchMenu.vue';
import EditTitleBar from '@/components/titleBar/EditTitleBar.vue';
import TitleBar from '@/components/titleBar/TitleBar.vue';
import container from '@/model/ModelContainer';
import ISocketIOModel from '@/model/socketio/ISocketIOModel';
import IScrollPositionState from '@/model/state/IScrollPositionState';
import IRecordedState, { MultipleDeletionOption } from '@/model/state/recorded/IRecordedState';
import ISnackbarState from '@/model/state/snackbar/ISnackbarState';
import { ISettingStorageModel, ISettingValue } from '@/model/storage/setting/ISettingStorageModel';
import Util from '@/util/Util';
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Route } from 'vue-router';
import * as apid from '../../../api';

Component.registerHooks(['beforeRouteUpdate', 'beforeRouteLeave']);

@Component({
    components: {
        TitleBar,
        EditTitleBar,
        RecordedSearchMenu,
        RecordedMainMenu,
        RecordedItems,
        Pagination,
        RecordedMultipleDeletionDialog,
        RecordedCleanupDialog,
        MoveToExternalDialog,
    },
})
export default class Recorded extends Vue {
    public isEditMode: boolean = false;
    public isOpenMultiplueDeletionDialog: boolean = false;
    public isOpenCleanupDialog: boolean = false;
    public isOpenMoveExternalDialog: boolean = false;
    public bulkMoveItems: apid.RecordedItem[] = [];

    private isVisibilityHidden: boolean = false;
    private recordedState: IRecordedState = container.get<IRecordedState>('IRecordedState');
    private setting: ISettingStorageModel = container.get<ISettingStorageModel>('ISettingStorageModel');
    private settingValue: ISettingValue | null = null;
    private scrollState: IScrollPositionState = container.get<IScrollPositionState>('IScrollPositionState');
    private snackbarState: ISnackbarState = container.get<ISnackbarState>('ISnackbarState');
    private socketIoModel: ISocketIOModel = container.get<ISocketIOModel>('ISocketIOModel');
    private onUpdateStatusCallback = (async (): Promise<void> => {
        await this.recordedState.fetchData(this.createFetchDataOption());
    }).bind(this);

    get selectedTitle(): string {
        const info = this.recordedState.getSelectedCnt();

        return `${info.cnt} 件選択 (${Util.getFileSizeStr(info.size)})`;
    }

    get contentWrapStyle(): any {
        return this.isVisibilityHidden === false
            ? {}
            : {
                  opacity: 0,
                  visibility: 'hidden',
              };
    }

    public created(): void {
        this.settingValue = this.setting.getSavedValue();

        // socket.io イベント
        this.socketIoModel.onUpdateState(this.onUpdateStatusCallback);
    }

    public beforeDestroy(): void {
        // socket.io イベント
        this.socketIoModel.offUpdateState(this.onUpdateStatusCallback);
    }

    public beforeRouteUpdate(to: Route, from: Route, next: () => void): void {
        this.isVisibilityHidden = true;

        this.$nextTick(() => {
            next();
        });
    }

    public gotoDetail(recordedId: apid.RecordedId): void {
        Util.move(this.$router, { path: `/recorded/detail/${recordedId.toString(10)}` });
    }

    public async stopEncode(recordedId: apid.RecordedId): Promise<void> {
        try {
            await this.recordedState.stopEncode(recordedId);
            this.snackbarState.open({
                color: 'success',
                text: 'エンコード停止',
            });
        } catch (err) {
            console.error(err);
            this.snackbarState.open({
                color: 'error',
                text: 'エンコード停止に失敗',
            });
        }
    }

    public onEdit(): void {
        this.isEditMode = true;
    }

    public onFinishEdit(): void {
        this.recordedState.clearSelect();
    }

    public onSelectAll(): void {
        this.recordedState.selectAll();
    }

    public selectItem(recordedId: apid.RecordedId): void {
        this.recordedState.select(recordedId);
    }

    public onMultiplueDeletion(): void {
        this.isOpenMultiplueDeletionDialog = true;
    }

    public async onExecuteMultiplueDeletion(option: MultipleDeletionOption): Promise<void> {
        this.isOpenMultiplueDeletionDialog = false;
        this.isEditMode = false;
        try {
            await this.recordedState.multiplueDeletion(option);
            this.snackbarState.open({
                color: 'success',
                text: '選択した番組を削除しました。',
            });
        } catch (err) {
            this.snackbarState.open({
                color: 'error',
                text: '一部番組の削除に失敗しました。',
            });
        }
    }

    public onCleanup(): void {
        this.isOpenCleanupDialog = true;
    }

    public toggleTableMode(): void {
        if (this.settingValue === null) return;
        this.setting.tmp.isShowTableMode = !this.setting.tmp.isShowTableMode;
        this.setting.save();
        this.settingValue = this.setting.getSavedValue();
    }

    public onBulkMoveExternal(): void {
        const selected: apid.RecordedItem[] = [];
        for (const r of this.recordedState.getRecorded()) {
            if (r.isSelected === true) {
                selected.push(r.recordedItem);
            }
        }
        if (selected.length === 0) {
            this.snackbarState.open({ color: 'info', text: '移動対象が選択されていません' });
            return;
        }
        this.bulkMoveItems = selected;
        this.isOpenMoveExternalDialog = true;
    }

    public async onBulkMoved(_jobIdOrIds: string | apid.RecordedId[]): Promise<void> {
        this.isEditMode = false;
        this.bulkMoveItems = [];
        this.recordedState.clearSelect();
        Util.move(this.$router, { path: '/external-storage/jobs' }).catch(() => {});
    }

    @Watch('$route', { immediate: true, deep: true })
    public onUrlChange(): void {
        this.recordedState.clearData();
        this.$nextTick(async () => {
            await this.recordedState.fetchData(this.createFetchDataOption()).catch(err => {
                this.snackbarState.open({
                    color: 'error',
                    text: '録画データ取得に失敗',
                });
                console.error(err);
            });

            this.isVisibilityHidden = false;

            // データ取得完了を通知
            await this.scrollState.emitDoneGetData();
        });
    }

    /**
     * 録画データ取得時のオプションを生成する
     * @return GetReserveOption
     */
    private createFetchDataOption(): apid.GetRecordedOption {
        if (this.settingValue === null) {
            throw new Error('SettingValueIsNull');
        }

        const option: apid.GetRecordedOption = {
            isHalfWidth: this.settingValue.isHalfWidthDisplayed,
            offset: (Util.getPageNum(this.$route) - 1) * this.settingValue.recordedLength,
            limit: this.settingValue.recordedLength,
        };

        // query から読み取り
        if (typeof this.$route.query.keyword === 'string') {
            option.keyword = this.$route.query.keyword;
        }
        if (typeof this.$route.query.ruleId !== 'undefined') {
            option.ruleId = parseInt(this.$route.query.ruleId as string, 10);
        }
        if (typeof this.$route.query.channelId !== 'undefined') {
            option.channelId = parseInt(this.$route.query.channelId as string, 10);
        }
        if (typeof this.$route.query.genre !== 'undefined') {
            option.genre = parseInt(this.$route.query.genre as string, 10);
        }
        if (typeof this.$route.query.hasOriginalFile !== 'undefined') {
            option.hasOriginalFile = (this.$route.query.hasOriginalFile as any) === true || this.$route.query.hasOriginalFile === 'true';
        }
        if (typeof this.$route.query.isInternal !== 'undefined') {
            option.isInternal = (this.$route.query.isInternal as any) === true || this.$route.query.isInternal === 'true';
        }
        if (typeof this.$route.query.isExternal !== 'undefined') {
            option.isExternal = (this.$route.query.isExternal as any) === true || this.$route.query.isExternal === 'true';
        }
        if (typeof this.$route.query.createdUser === 'string' && this.$route.query.createdUser.length > 0) {
            option.createdUser = this.$route.query.createdUser;
        }

        return option;
    }
}
</script>

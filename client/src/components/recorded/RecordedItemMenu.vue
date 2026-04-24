<template>
    <div class="recorded-item-menu">
        <v-menu class="menu" v-model="isOpened" bottom left>
            <template v-slot:activator="{ on }">
                <v-btn icon class="menu-button" v-on="on">
                    <v-icon>mdi-dots-vertical</v-icon>
                </v-btn>
            </template>
            <v-list>
                <v-list-item v-if="typeof recordedItem.ruleId !== 'undefined'" v-on:click="gotoRule">
                    <v-list-item-icon class="mr-3">
                        <v-icon>mdi-calendar</v-icon>
                    </v-list-item-icon>
                    <v-list-item-content>
                        <v-list-item-title>ルール編集</v-list-item-title>
                    </v-list-item-content>
                </v-list-item>
                <v-list-item v-on:click="search">
                    <v-list-item-icon class="mr-3">
                        <v-icon>mdi-magnify</v-icon>
                    </v-list-item-icon>
                    <v-list-item-content>
                        <v-list-item-title>同ルールの録画</v-list-item-title>
                    </v-list-item-content>
                </v-list-item>
                <v-list-item v-if="recordedItem.isProtected === true" v-on:click="unprotect">
                    <v-list-item-icon class="mr-3">
                        <v-icon>mdi-lock-open</v-icon>
                    </v-list-item-icon>
                    <v-list-item-content>
                        <v-list-item-title>保護解除</v-list-item-title>
                    </v-list-item-content>
                </v-list-item>
                <v-list-item v-else v-on:click="protect">
                    <v-list-item-icon class="mr-3">
                        <v-icon>mdi-lock</v-icon>
                    </v-list-item-icon>
                    <v-list-item-content>
                        <v-list-item-title>保護</v-list-item-title>
                    </v-list-item-content>
                </v-list-item>
                <v-list-item v-if="recordedItem.isRecording === false && serverConfig.isEnableEncode() === true" v-on:click="openEncodeDialog">
                    <v-list-item-icon class="mr-3">
                        <v-icon>mdi-plus-circle-outline</v-icon>
                    </v-list-item-icon>
                    <v-list-item-content>
                        <v-list-item-title>エンコード</v-list-item-title>
                    </v-list-item-content>
                </v-list-item>
                <v-list-item v-if="recordedItem.isEncoding === true" v-on:click="stopEncode">
                    <v-list-item-icon class="mr-3">
                        <v-icon>mdi-stop</v-icon>
                    </v-list-item-icon>
                    <v-list-item-content>
                        <v-list-item-title>エンコード停止</v-list-item-title>
                    </v-list-item-content>
                </v-list-item>
                <v-list-item
                    v-if="recordedItem.isRecording === false && recordedItem.isEncoding === false && typeof recordedItem.externalPath === 'undefined'"
                    v-on:click="openMoveToExternalDialog"
                >
                    <v-list-item-icon class="mr-3">
                        <v-icon>mdi-folder-move-outline</v-icon>
                    </v-list-item-icon>
                    <v-list-item-content>
                        <v-list-item-title>外部ストレージへ移動</v-list-item-title>
                    </v-list-item-content>
                </v-list-item>
                <v-list-item v-on:click="openDeleteDialog">
                    <v-list-item-icon class="mr-3">
                        <v-icon>mdi-delete</v-icon>
                    </v-list-item-icon>
                    <v-list-item-content>
                        <v-list-item-title>削除</v-list-item-title>
                    </v-list-item-content>
                </v-list-item>
            </v-list>
        </v-menu>
        <div v-if="isOpened === true" class="menu-background" v-on:click="onClickMenuBackground"></div>
        <AddEncodeDialog :isOpen.sync="isOpenEncodeDialog" :recordedItem="recordedItem"></AddEncodeDialog>
        <RecordedDeleteDialog :isOpen.sync="isOpenDeleteDialog" :recordedItem="recordedItem"></RecordedDeleteDialog>
        <MoveToExternalDialog :isOpen.sync="isOpenMoveToExternalDialog" :recordedItem="recordedItem"></MoveToExternalDialog>
    </div>
</template>

<script lang="ts">
import AddEncodeDialog from '@/components/encode/AddEncodeDialog.vue';
import MoveToExternalDialog from '@/components/recorded/MoveToExternalDialog.vue';
import RecordedDeleteDialog from '@/components/recorded/RecordedDeleteDialog.vue';
import IRecordedApiModel from '@/model/api/recorded/IRecordedApiModel';
import container from '@/model/ModelContainer';
import IServerConfigModel from '@/model/serverConfig/IServerConfigModel';
import ISnackbarState from '@/model/state/snackbar/ISnackbarState';
import StrUtil from '@/util/StrUtil';
import Util from '@/util/Util';
import { Component, Prop, Vue } from 'vue-property-decorator';
import * as apid from '../../../../api';

@Component({
    components: {
        AddEncodeDialog,
        MoveToExternalDialog,
        RecordedDeleteDialog,
    },
})
export default class RecordedItemMenu extends Vue {
    @Prop({
        required: true,
    })
    public recordedItem!: apid.RecordedItem;

    public isOpened: boolean = false;
    public isOpenDeleteDialog: boolean = false;
    public isOpenEncodeDialog: boolean = false;
    public isOpenMoveToExternalDialog: boolean = false;

    public serverConfig: IServerConfigModel = container.get<IServerConfigModel>('IServerConfigModel');
    public recordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
    private snackbarState: ISnackbarState = container.get<ISnackbarState>('ISnackbarState');

    public async gotoRule(): Promise<void> {
        if (typeof this.recordedItem.ruleId === 'undefined') {
            return;
        }

        await Util.sleep(300);
        Util.move(this.$router, {
            path: '/search',
            query: {
                rule: this.recordedItem.ruleId.toString(10),
            },
        });
    }

    public async search(): Promise<void> {
        await Util.sleep(300);

        if (typeof this.recordedItem.ruleId !== 'undefined') {
            Util.move(this.$router, {
                path: '/recorded',
                query: {
                    ruleId: this.recordedItem.ruleId.toString(10),
                },
            });

            return;
        }

        // recorded 絞り込み
        Util.move(this.$router, {
            path: '/recorded',
            query: {
                keyword: StrUtil.createSearchKeyword(this.recordedItem.name),
            },
        });
    }

    public async unprotect(): Promise<void> {
        try {
            await this.recordedApiModel.unprotect(this.recordedItem.id);
            this.snackbarState.open({
                color: 'success',
                text: '保護解除に成功',
            });
        } catch (err) {
            this.snackbarState.open({
                color: 'error',
                text: '保護解除に失敗',
            });
        }
    }

    public async protect(): Promise<void> {
        try {
            await this.recordedApiModel.protect(this.recordedItem.id);
            this.snackbarState.open({
                color: 'success',
                text: '保護に成功',
            });
        } catch (err) {
            this.snackbarState.open({
                color: 'error',
                text: '保護に失敗',
            });
        }
    }

    public async stopEncode(): Promise<void> {
        this.$emit('stopEncode', this.recordedItem.id);
    }

    public async openDeleteDialog(): Promise<void> {
        await Util.sleep(300);
        this.isOpenDeleteDialog = true;
    }

    public async openEncodeDialog(): Promise<void> {
        await Util.sleep(300);
        this.isOpenEncodeDialog = true;
    }

    public async openMoveToExternalDialog(): Promise<void> {
        await Util.sleep(300);
        this.isOpenMoveToExternalDialog = true;
    }

    public onClickMenuBackground(e: Event): boolean {
        e.stopPropagation();

        return false;
    }
}
</script>

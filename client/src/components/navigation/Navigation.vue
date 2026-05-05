<template>
    <v-navigation-drawer
        v-model="navigationState.openState"
        :clipped="navigationState.isClipped"
        :permanent="navigationState.type === 'permanent'"
        :temporary="navigationState.type === 'temporary'"
        app
        overflow
    >
        <v-list-item>
            <v-list-item-content>
                <v-list-item-title class="title">{{ versionState.getVersionString() }}</v-list-item-title>
            </v-list-item-content>
        </v-list-item>

        <v-list dense>
            <v-list-item-group multiple :max="0">
                <v-list-item
                    v-for="(item, index) in navigationState.items"
                    :key="item.id"
                    link
                    :disabled="item.herf === null"
                    v-on:click="route(item)"
                    v-bind:class="getNavigationItemClass(index)"
                >
                    <v-list-item-icon>
                        <v-icon>{{ item.icon }}</v-icon>
                    </v-list-item-icon>

                    <v-list-item-content>
                        <v-list-item-title>
                            {{ item.title }}
                            <v-badge v-if="typeof item.badge === 'number' && item.badge > 0" :color="item.badgeColor || 'red'" :content="item.badge" inline></v-badge>
                        </v-list-item-title>
                    </v-list-item-content>
                </v-list-item>
            </v-list-item-group>
        </v-list>
        <div class="list-dummy"></div>
    </v-navigation-drawer>
</template>

<script lang="ts">
import container from '@/model/ModelContainer';
import IServerConfigModel from '@/model/serverConfig/IServerConfigModel';
import INavigationState from '@/model/state/navigation/INavigationState';
import ISocketIOModel from '@/model/socketio/ISocketIOModel';
import ISnackbarState from '@/model/state/snackbar/ISnackbarState';
import IVersionState from '@/model/state/version/IVersionState';
import IReservesApiModel from '@/model/api/reserves/IReservesApiModel';
import { ISettingStorageModel, ISettingValue } from '@/model/storage/setting/ISettingStorageModel';
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Location } from 'vue-router';
import Util from '../../util/Util';

interface NavigationItem {
    title: string;
    icon: string;
    herf: Location | null;
}

@Component({})
export default class Navigation extends Vue {
    public navigationState: INavigationState = container.get<INavigationState>('INavigationState');

    private serverConfig: IServerConfigModel = container.get<IServerConfigModel>('IServerConfigModel');
    private setting: ISettingStorageModel = container.get<ISettingStorageModel>('ISettingStorageModel');
    private socketIoModel: ISocketIOModel = container.get<ISocketIOModel>('ISocketIOModel');
    private snackbarState: ISnackbarState = container.get<ISnackbarState>('ISnackbarState');
    private versionState: IVersionState = container.get<IVersionState>('IVersionState');
    private reservesApiModel: IReservesApiModel = container.get<IReservesApiModel>('IReservesApiModel');
    private onUpdateStatusCallback = (async (): Promise<void> => {
        await Promise.all([this.versionState.fetchData(), this.fetchConflictBadge()]);
    }).bind(this);

    private async fetchConflictBadge(): Promise<void> {
        try {
            const cnts = await this.reservesApiModel.getCnts();
            this.navigationState.setBadge('reserves', cnts.conflicts);
        } catch (err) {
            // 件数取得失敗は致命的でないので無視
        }
    }

    public async created(): Promise<void> {
        this.navigationState.updateItems(this.$route);

        // socket.io イベント
        this.socketIoModel.onUpdateState(this.onUpdateStatusCallback);

        await this.fetchConflictBadge();
    }

    public beforeDestroy(): void {
        // socket.io イベント
        this.socketIoModel.offUpdateState(this.onUpdateStatusCallback);
    }

    public getNavigationItemClass(index: number): any {
        return this.navigationState.navigationPosition === index
            ? {
                  selected: true,
              }
            : {};
    }

    /**
     * ナビゲーション要素クリック時に呼ばれ、ページを移動する
     * @param item: NavigationItem
     */
    public async route(item: NavigationItem): Promise<void> {
        if (item.herf === null) {
            return;
        }

        // デスクトップ未満のサイズであったらナビゲーションを閉じる
        if (window.innerWidth < 1264) {
            this.navigationState.openState = false;
            await Util.sleep(200);
        }

        Util.move(this.$router, item.herf).catch(err => {
            console.error(err);
        });
    }

    @Watch('$route', { immediate: true, deep: true })
    public onUrlChange(): void {
        this.updateSelected();

        this.$nextTick(async () => {
            await this.versionState.fetchData().catch(err => {
                this.snackbarState.open({
                    color: 'error',
                    text: 'バージョン情報取得に失敗',
                });
                console.error(err);
            });
        });
    }

    /**
     * 選択位置を更新
     */
    private updateSelected(): void {
        this.$nextTick(() => {
            this.navigationState.updateNavigationPosition(this.$route);
        });
    }
}
</script>

<style lang="sass" scoped>
.list-dummy
    margin-bottom: 16px

.v-item-group
    .selected
        &:before
            opacity: 0.12

// iOS デバイスで一番下までスクロールできないため
.v-navigation-drawer
    height: 100% !important
</style>

<template>
    <v-main>
        <TitleBar title="外部ストレージ"></TitleBar>
        <v-container>
            <div v-if="storageOptions.length === 0" class="body-1">config.yml に externalStorage が設定されていません。</div>
            <div v-else>
                <!-- ストレージ選択 -->
                <v-select
                    v-if="storageOptions.length > 1"
                    v-model="selectedStorage"
                    :items="storageOptions"
                    item-text="label"
                    item-value="name"
                    label="ストレージ"
                    hide-details
                    dense
                    class="mb-3"
                    v-on:change="onStorageChange"
                ></v-select>

                <!-- Breadcrumb + 新規フォルダ -->
                <div class="d-flex align-center">
                    <v-breadcrumbs :items="breadcrumbs" class="pa-0 flex-grow-1">
                        <template v-slot:item="{ item }">
                            <v-breadcrumbs-item :href="item.href" :disabled="item.disabled" v-on:click.prevent="navigate(item.subPath)">
                                {{ item.text }}
                            </v-breadcrumbs-item>
                        </template>
                    </v-breadcrumbs>
                    <v-btn small text v-on:click="openMkdirDialog">
                        <v-icon small left>mdi-folder-plus-outline</v-icon>
                        新規フォルダ
                    </v-btn>
                </div>

                <!-- ファイル/ディレクトリ一覧 -->
                <v-card v-if="list" class="mt-2">
                    <v-simple-table>
                        <thead>
                            <tr>
                                <th style="width: 40px"></th>
                                <th>名前</th>
                                <th style="width: 120px" class="text-right">サイズ</th>
                                <th style="width: 170px">更新日時</th>
                                <th style="width: 60px"></th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-if="list.subPath.length > 0" v-on:click="navigateUp" class="row-link">
                                <td><v-icon>mdi-arrow-up-bold</v-icon></td>
                                <td>..</td>
                                <td></td>
                                <td></td>
                                <td></td>
                            </tr>
                            <tr v-for="item in list.items" :key="item.name" v-on:click="onRowClick(item)" v-bind:class="{ 'row-link': item.type === 'dir' }">
                                <td>
                                    <v-icon v-if="item.type === 'dir'">mdi-folder-outline</v-icon>
                                    <v-icon v-else>mdi-file-outline</v-icon>
                                </td>
                                <td>
                                    <div>{{ item.name }}</div>
                                    <div v-if="item.recordedIds && item.recordedIds.length > 0" class="mt-1">
                                        <v-chip v-for="rid in item.recordedIds" :key="rid" x-small label color="grey lighten-3" class="mr-1" v-on:click.stop="gotoRecorded(rid)">
                                            {{ recordedNameMap[rid] || '録画 #' + rid }}
                                        </v-chip>
                                    </div>
                                </td>
                                <td class="text-right">{{ item.type === 'dir' ? '' : formatSize(item.size) }}</td>
                                <td>{{ formatMtime(item.mtime) }}</td>
                                <td>
                                    <div class="d-flex">
                                        <v-btn v-if="item.type === 'file'" icon small title="別フォルダへ移動" v-on:click.stop="openRelocateDialog(item)">
                                            <v-icon small>mdi-folder-move-outline</v-icon>
                                        </v-btn>
                                        <v-btn icon small title="リネーム" v-on:click.stop="openRenameDialog(item)">
                                            <v-icon small>mdi-pencil</v-icon>
                                        </v-btn>
                                    </div>
                                </td>
                            </tr>
                            <tr v-if="list.items.length === 0 && list.subPath.length === 0">
                                <td colspan="5" class="text-center body-2 text-disabled">(空)</td>
                            </tr>
                        </tbody>
                    </v-simple-table>
                </v-card>
            </div>

            <!-- リネームダイアログ -->
            <v-dialog v-model="renameDialogOpen" max-width="900" width="90%">
                <v-card>
                    <v-card-title>リネーム</v-card-title>
                    <v-card-text>
                        <div class="body-2 mb-2 path-break">{{ renameTargetSubPath }}</div>
                        <v-text-field v-model="renameNewName" label="新しい名前" autofocus></v-text-field>
                    </v-card-text>
                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn text v-on:click="renameDialogOpen = false">キャンセル</v-btn>
                        <v-btn color="primary" :disabled="!canSubmitRename || isRenaming" :loading="isRenaming" v-on:click="submitRename">変更</v-btn>
                    </v-card-actions>
                </v-card>
            </v-dialog>

            <!-- 新規フォルダダイアログ -->
            <v-dialog v-model="mkdirDialogOpen" max-width="500">
                <v-card>
                    <v-card-title>新規フォルダ</v-card-title>
                    <v-card-text>
                        <div class="body-2 text--secondary mb-2 path-break">作成先: {{ list ? list.subPath || '/' : '' }}</div>
                        <v-text-field v-model="mkdirFolderName" label="フォルダ名" autofocus></v-text-field>
                    </v-card-text>
                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn text v-on:click="mkdirDialogOpen = false">キャンセル</v-btn>
                        <v-btn color="primary" :disabled="!canSubmitMkdir || isMkdir" :loading="isMkdir" v-on:click="submitMkdir">作成</v-btn>
                    </v-card-actions>
                </v-card>
            </v-dialog>

            <!-- ファイル移動ダイアログ -->
            <v-dialog v-model="relocateDialogOpen" max-width="900" width="90%">
                <v-card>
                    <v-card-title>フォルダへ移動</v-card-title>
                    <v-card-text>
                        <div class="body-2 path-break mb-3">対象: {{ relocateTargetSubPath }}</div>
                        <v-radio-group v-model="relocateTargetDir" column>
                            <v-radio v-for="opt in relocateOptions" :key="opt.value" :value="opt.value" :label="opt.label"></v-radio>
                        </v-radio-group>
                        <div v-if="relocateOptions.length === 0" class="body-2 text--disabled">移動先候補がありません (親フォルダもサブフォルダも無し)</div>
                    </v-card-text>
                    <v-card-actions>
                        <v-spacer></v-spacer>
                        <v-btn text v-on:click="relocateDialogOpen = false">キャンセル</v-btn>
                        <v-btn color="primary" :disabled="!canSubmitRelocate || isRelocating" :loading="isRelocating" v-on:click="submitRelocate">移動</v-btn>
                    </v-card-actions>
                </v-card>
            </v-dialog>
        </v-container>
    </v-main>
</template>

<script lang="ts">
import TitleBar from '@/components/titleBar/TitleBar.vue';
import IExternalStorageApiModel from '@/model/api/externalStorage/IExternalStorageApiModel';
import container from '@/model/ModelContainer';
import ISnackbarState from '@/model/state/snackbar/ISnackbarState';
import DateUtil from '@/util/DateUtil';
import Util from '@/util/Util';
import { Component, Vue, Watch } from 'vue-property-decorator';
import { Route } from 'vue-router';
import * as apid from '../../../api';

interface BreadcrumbItem {
    text: string;
    href: string;
    subPath: string;
    disabled: boolean;
}

@Component({
    components: {
        TitleBar,
    },
})
export default class ExternalStorage extends Vue {
    public storageOptions: { name: string; label: string; path: string }[] = [];
    public selectedStorage: string | null = null;
    public list: apid.ExternalStorageFileList | null = null;

    public renameDialogOpen: boolean = false;
    public renameTarget: apid.ExternalStorageFileEntry | null = null;
    public renameNewName: string = '';
    public isRenaming: boolean = false;

    public mkdirDialogOpen: boolean = false;
    public mkdirFolderName: string = '';
    public isMkdir: boolean = false;

    public relocateDialogOpen: boolean = false;
    public relocateTarget: apid.ExternalStorageFileEntry | null = null;
    public relocateTargetDir: string | null = null;
    public isRelocating: boolean = false;

    get renameTargetSubPath(): string {
        if (this.renameTarget === null) return '';
        return this.currentSubPath.length > 0 ? `${this.currentSubPath}/${this.renameTarget.name}` : this.renameTarget.name;
    }

    get canSubmitMkdir(): boolean {
        const t = this.mkdirFolderName.trim();
        if (t.length === 0) return false;
        if (t.indexOf('/') !== -1 || t.indexOf('\\') !== -1) return false;
        if (t === '.' || t === '..') return false;
        return true;
    }

    get relocateTargetSubPath(): string {
        if (this.relocateTarget === null) return '';
        return this.currentSubPath.length > 0 ? `${this.currentSubPath}/${this.relocateTarget.name}` : this.relocateTarget.name;
    }

    get relocateOptions(): { label: string; value: string }[] {
        const opts: { label: string; value: string }[] = [];
        // 親フォルダ
        if (this.currentSubPath.length > 0) {
            const parts = this.currentSubPath.split('/').filter(p => p.length > 0);
            parts.pop();
            const parent = parts.join('/');
            opts.push({ label: '.. (親フォルダ: ' + (parent || '/') + ')', value: parent });
        }
        // 現在のフォルダ配下のサブフォルダ
        if (this.list) {
            for (const item of this.list.items) {
                if (item.type !== 'dir') continue;
                const path = this.currentSubPath.length > 0 ? `${this.currentSubPath}/${item.name}` : item.name;
                opts.push({ label: item.name + ' (' + path + ')', value: path });
            }
        }
        return opts;
    }

    get canSubmitRelocate(): boolean {
        return this.relocateTarget !== null && typeof this.relocateTargetDir === 'string';
    }

    get canSubmitRename(): boolean {
        if (this.renameTarget === null) return false;
        const trimmed = this.renameNewName.trim();
        if (trimmed.length === 0) return false;
        if (trimmed === this.renameTarget.name) return false;
        if (trimmed.indexOf('/') !== -1 || trimmed.indexOf('\\') !== -1) return false;
        if (trimmed === '.' || trimmed === '..') return false;
        return true;
    }

    get recordedNameMap(): { [id: number]: string } {
        const m: { [id: number]: string } = {};
        if (this.list) {
            for (const r of this.list.relatedRecordeds) {
                m[r.id] = r.name;
            }
        }
        return m;
    }

    private api = container.get<IExternalStorageApiModel>('IExternalStorageApiModel');
    private snackbar = container.get<ISnackbarState>('ISnackbarState');

    public async created(): Promise<void> {
        await this.loadStorages();
        this.syncFromRoute();
        await this.reload();
    }

    public async loadStorages(): Promise<void> {
        try {
            const res = await this.api.getList();
            this.storageOptions = res.items.map(i => ({
                name: i.name,
                path: i.path,
                label: `${i.name} (${i.path})`,
            }));
        } catch (err) {
            this.snackbar.open({ color: 'error', text: '外部ストレージ一覧取得失敗' });
        }
    }

    private syncFromRoute(): void {
        const qStorage = this.$route.query.storage;
        if (typeof qStorage === 'string' && this.storageOptions.find(o => o.name === qStorage)) {
            this.selectedStorage = qStorage;
        } else if (this.storageOptions.length > 0) {
            this.selectedStorage = this.storageOptions[0].name;
        }
    }

    get currentSubPath(): string {
        const q = this.$route.query.path;
        return typeof q === 'string' ? q : '';
    }

    get breadcrumbs(): BreadcrumbItem[] {
        const items: BreadcrumbItem[] = [{ text: this.selectedStorage ?? '', href: '#', subPath: '', disabled: false }];
        const parts = this.currentSubPath.split('/').filter(p => p.length > 0);
        let acc = '';
        for (const p of parts) {
            acc = acc.length > 0 ? `${acc}/${p}` : p;
            items.push({ text: p, href: '#', subPath: acc, disabled: false });
        }
        if (items.length > 0) {
            items[items.length - 1].disabled = true;
        }
        return items;
    }

    public async reload(): Promise<void> {
        if (this.selectedStorage === null) {
            return;
        }
        try {
            this.list = await this.api.getFiles(this.selectedStorage, this.currentSubPath);
        } catch (err: any) {
            this.snackbar.open({ color: 'error', text: `取得失敗: ${err?.response?.data?.message ?? err.message ?? ''}` });
            this.list = null;
        }
    }

    public onStorageChange(): void {
        this.navigate('');
    }

    public onRowClick(item: apid.ExternalStorageFileEntry): void {
        if (item.type === 'dir') {
            const next = this.currentSubPath.length > 0 ? `${this.currentSubPath}/${item.name}` : item.name;
            this.navigate(next);
        }
    }

    public navigate(subPath: string): void {
        const q: Record<string, string> = {};
        if (this.selectedStorage) q.storage = this.selectedStorage;
        if (subPath.length > 0) q.path = subPath;
        Util.move(this.$router, { path: '/external-storage', query: q }).catch(() => {});
    }

    public navigateUp(): void {
        const parts = this.currentSubPath.split('/').filter(p => p.length > 0);
        parts.pop();
        this.navigate(parts.join('/'));
    }

    public gotoRecorded(id: apid.RecordedId): void {
        Util.move(this.$router, { path: `/recorded/detail/${id}` }).catch(() => {});
    }

    public openRenameDialog(item: apid.ExternalStorageFileEntry): void {
        this.renameTarget = item;
        this.renameNewName = item.name;
        this.renameDialogOpen = true;
    }

    public openMkdirDialog(): void {
        this.mkdirFolderName = '';
        this.mkdirDialogOpen = true;
    }

    public async submitMkdir(): Promise<void> {
        if (!this.canSubmitMkdir || this.selectedStorage === null) return;
        this.isMkdir = true;
        try {
            await this.api.mkdir(this.selectedStorage, {
                parentSubPath: this.currentSubPath,
                folderName: this.mkdirFolderName.trim(),
            });
            this.snackbar.open({ color: 'success', text: 'フォルダを作成しました' });
            this.mkdirDialogOpen = false;
            await this.reload();
        } catch (err: any) {
            this.snackbar.open({ color: 'error', text: `作成失敗: ${err?.response?.data?.message ?? err.message ?? ''}` });
        } finally {
            this.isMkdir = false;
        }
    }

    public openRelocateDialog(item: apid.ExternalStorageFileEntry): void {
        this.relocateTarget = item;
        this.relocateTargetDir = null;
        this.relocateDialogOpen = true;
    }

    public async submitRelocate(): Promise<void> {
        if (!this.canSubmitRelocate || this.relocateTarget === null || this.selectedStorage === null || this.relocateTargetDir === null) return;
        this.isRelocating = true;
        try {
            await this.api.relocate(this.selectedStorage, {
                subPath: this.relocateTargetSubPath,
                targetDir: this.relocateTargetDir,
            });
            this.snackbar.open({ color: 'success', text: '移動しました' });
            this.relocateDialogOpen = false;
            this.relocateTarget = null;
            await this.reload();
        } catch (err: any) {
            this.snackbar.open({ color: 'error', text: `移動失敗: ${err?.response?.data?.message ?? err.message ?? ''}` });
        } finally {
            this.isRelocating = false;
        }
    }

    public async submitRename(): Promise<void> {
        if (!this.canSubmitRename || this.renameTarget === null || this.selectedStorage === null) return;
        this.isRenaming = true;
        try {
            await this.api.rename(this.selectedStorage, {
                subPath: this.renameTargetSubPath,
                newName: this.renameNewName.trim(),
            });
            this.snackbar.open({ color: 'success', text: 'リネームしました' });
            this.renameDialogOpen = false;
            this.renameTarget = null;
            await this.reload();
        } catch (err: any) {
            this.snackbar.open({ color: 'error', text: `リネーム失敗: ${err?.response?.data?.message ?? err.message ?? ''}` });
        } finally {
            this.isRenaming = false;
        }
    }

    public formatSize(bytes: number): string {
        if (bytes < 1024) return `${bytes} B`;
        const units = ['KB', 'MB', 'GB', 'TB'];
        let n = bytes / 1024;
        let i = 0;
        while (n >= 1024 && i < units.length - 1) {
            n /= 1024;
            i++;
        }
        return `${n.toFixed(1)} ${units[i]}`;
    }

    public formatMtime(ms: number): string {
        if (!ms) return '';
        return DateUtil.format(DateUtil.getJaDate(new Date(ms)), 'MM/dd(w) hh:mm');
    }

    @Watch('$route', { immediate: false })
    public async onRouteChange(_to: Route): Promise<void> {
        this.syncFromRoute();
        await this.reload();
    }
}
</script>

<style lang="sass" scoped>
.row-link
    cursor: pointer

.path-break
    word-break: break-all
    color: rgba(0, 0, 0, 0.6)
</style>

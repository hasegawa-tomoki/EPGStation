<template>
    <v-dialog v-model="dialogModel" scrollable max-width="500">
        <v-card>
            <v-card-title>外部ストレージへ移動</v-card-title>
            <v-card-text>
                <div v-if="targetItems.length === 1" class="body-2 mb-3">「{{ targetItems[0].name }}」の録画ファイル一式を外部ストレージへ物理移動します。</div>
                <div v-else class="body-2 mb-3">
                    選択した
                    <strong>{{ targetItems.length }}</strong>
                    件の録画を外部ストレージへ移動します。
                    <div v-if="skippedCount > 0" class="caption text--secondary mt-1">※ {{ skippedCount }} 件は移動対象外 (既に外部/録画中/エンコード中) のためスキップ</div>
                </div>
                <v-select
                    v-model="selectedStorageName"
                    :items="storageOptions"
                    item-text="label"
                    item-value="name"
                    label="外部ストレージ"
                    :disabled="storageOptions.length === 0"
                    hide-details
                    class="mb-4"
                ></v-select>
                <v-text-field v-model="subDirectory" label="サブディレクトリ (任意)" hint="例: ドラマ/2026" persistent-hint></v-text-field>
                <div v-if="isSubmitting && targetItems.length > 1" class="mt-3">
                    <v-progress-linear :value="progressPercent" height="8"></v-progress-linear>
                    <div class="caption mt-1">{{ progressCurrent }} / {{ targetItems.length }} 件処理中</div>
                </div>
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn text :disabled="isSubmitting" v-on:click="dialogModel = false">キャンセル</v-btn>
                <v-btn color="primary" :disabled="!canSubmit || isSubmitting" :loading="isSubmitting" v-on:click="submit">移動</v-btn>
            </v-card-actions>
        </v-card>
    </v-dialog>
</template>

<script lang="ts">
import IExternalStorageApiModel from '@/model/api/externalStorage/IExternalStorageApiModel';
import IRecordedApiModel from '@/model/api/recorded/IRecordedApiModel';
import container from '@/model/ModelContainer';
import ISnackbarState from '@/model/state/snackbar/ISnackbarState';
import { Component, Prop, Vue, Watch } from 'vue-property-decorator';
import * as apid from '../../../../api';

@Component
export default class MoveToExternalDialog extends Vue {
    @Prop({ required: true })
    public isOpen!: boolean;

    // 単品用 (既存の呼び出し互換)
    @Prop({ required: false, default: null })
    public recordedItem!: apid.RecordedItem | null;

    // 複数一括用
    @Prop({ required: false, default: (): apid.RecordedItem[] => [] })
    public recordedItems!: apid.RecordedItem[];

    public storageOptions: { name: string; label: string; path: string }[] = [];
    public selectedStorageName: string | null = null;
    public subDirectory: string = '';
    public isSubmitting: boolean = false;
    public progressCurrent: number = 0;

    private externalStorageApi = container.get<IExternalStorageApiModel>('IExternalStorageApiModel');
    private recordedApi = container.get<IRecordedApiModel>('IRecordedApiModel');
    private snackbar = container.get<ISnackbarState>('ISnackbarState');

    get dialogModel(): boolean {
        return this.isOpen;
    }
    set dialogModel(value: boolean) {
        this.$emit('update:isOpen', value);
    }

    /**
     * 実際に移動対象にする RecordedItem 一覧 (録画中/エンコード中/既に外部はスキップ)
     */
    get targetItems(): apid.RecordedItem[] {
        const all: apid.RecordedItem[] = this.recordedItems.length > 0 ? this.recordedItems : this.recordedItem ? [this.recordedItem] : [];
        return all.filter(r => r.isRecording === false && r.isEncoding === false && typeof r.externalPath === 'undefined');
    }

    get skippedCount(): number {
        const all = this.recordedItems.length > 0 ? this.recordedItems : this.recordedItem ? [this.recordedItem] : [];
        return all.length - this.targetItems.length;
    }

    get progressPercent(): number {
        if (this.targetItems.length === 0) return 0;
        return Math.round((this.progressCurrent / this.targetItems.length) * 100);
    }

    get canSubmit(): boolean {
        return typeof this.selectedStorageName === 'string' && this.selectedStorageName.length > 0 && this.targetItems.length > 0;
    }

    @Watch('isOpen')
    public async onOpen(newVal: boolean): Promise<void> {
        if (newVal === true) {
            await this.loadStorages();
            this.subDirectory = '';
            this.progressCurrent = 0;
            if (this.storageOptions.length === 1 && this.selectedStorageName === null) {
                this.selectedStorageName = this.storageOptions[0].name;
            }
        }
    }

    public async loadStorages(): Promise<void> {
        try {
            const list = await this.externalStorageApi.getList();
            this.storageOptions = list.items.map(item => ({
                name: item.name,
                label: `${item.name} (${item.path})`,
                path: item.path,
            }));
        } catch (err) {
            this.snackbar.open({ color: 'error', text: '外部ストレージ一覧の取得に失敗' });
        }
    }

    public async submit(): Promise<void> {
        if (!this.canSubmit || this.selectedStorageName === null) {
            return;
        }
        this.isSubmitting = true;
        this.progressCurrent = 0;

        const storageName = this.selectedStorageName;
        const subDirectory = this.subDirectory.length > 0 ? this.subDirectory : null;
        const movedIds: number[] = [];
        const failures: { id: number; name: string; message: string }[] = [];

        for (const item of this.targetItems) {
            try {
                await this.recordedApi.moveToExternalStorage(item.id, { storageName, subDirectory });
                movedIds.push(item.id);
            } catch (err: any) {
                failures.push({
                    id: item.id,
                    name: item.name,
                    message: err?.response?.data?.message ?? err.message ?? 'unknown',
                });
            }
            this.progressCurrent++;
        }

        this.isSubmitting = false;

        if (failures.length === 0) {
            this.snackbar.open({
                color: 'success',
                text: movedIds.length === 1 ? '外部ストレージへの移動が完了' : `外部ストレージへ ${movedIds.length} 件移動しました`,
            });
        } else {
            this.snackbar.open({
                color: 'error',
                text: `移動に一部失敗 (成功 ${movedIds.length} / 失敗 ${failures.length}): ${failures[0].name} - ${failures[0].message}`,
            });
            console.error('move failures', failures);
        }
        this.dialogModel = false;
        this.$emit('moved', movedIds);
    }
}
</script>

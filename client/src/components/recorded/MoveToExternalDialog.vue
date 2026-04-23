<template>
    <v-dialog v-model="dialogModel" scrollable max-width="500">
        <v-card>
            <v-card-title>外部ストレージへ移動</v-card-title>
            <v-card-text>
                <div class="body-2 mb-3">
                    「{{ recordedItem.name }}」の録画ファイル一式を外部ストレージへ物理移動します。
                    <br />
                    移動後は EPGStation からの再生/エンコードができなくなります。
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
            </v-card-text>
            <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn text v-on:click="dialogModel = false">キャンセル</v-btn>
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

    @Prop({ required: true })
    public recordedItem!: apid.RecordedItem;

    public storageOptions: { name: string; label: string; path: string }[] = [];
    public selectedStorageName: string | null = null;
    public subDirectory: string = '';
    public isSubmitting: boolean = false;

    private externalStorageApi = container.get<IExternalStorageApiModel>('IExternalStorageApiModel');
    private recordedApi = container.get<IRecordedApiModel>('IRecordedApiModel');
    private snackbar = container.get<ISnackbarState>('ISnackbarState');

    get dialogModel(): boolean {
        return this.isOpen;
    }
    set dialogModel(value: boolean) {
        this.$emit('update:isOpen', value);
    }

    get canSubmit(): boolean {
        return typeof this.selectedStorageName === 'string' && this.selectedStorageName.length > 0;
    }

    @Watch('isOpen')
    public async onOpen(newVal: boolean): Promise<void> {
        if (newVal === true) {
            await this.loadStorages();
            this.subDirectory = '';
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
        try {
            await this.recordedApi.moveToExternalStorage(this.recordedItem.id, {
                storageName: this.selectedStorageName,
                subDirectory: this.subDirectory.length > 0 ? this.subDirectory : null,
            });
            this.snackbar.open({ color: 'success', text: '外部ストレージへの移動が完了' });
            this.dialogModel = false;
            this.$emit('moved', this.recordedItem.id);
        } catch (err: any) {
            this.snackbar.open({ color: 'error', text: `移動に失敗: ${err?.response?.data?.message ?? err.message ?? ''}` });
        } finally {
            this.isSubmitting = false;
        }
    }
}
</script>

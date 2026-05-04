<template>
    <div>
        <v-btn v-if="recordedItem.isRecording === false && recordedItem.isEncoding === false" color="indigo white--text" v-on:click="requestTranscribe" class="ma-1">
            <v-icon left dark>mdi-text-box-outline</v-icon>
            transcribe
        </v-btn>
    </div>
</template>

<script lang="ts">
import IRecordedApiModel from '@/model/api/recorded/IRecordedApiModel';
import container from '@/model/ModelContainer';
import ISnackbarState from '@/model/state/snackbar/ISnackbarState';
import { Component, Prop, Vue } from 'vue-property-decorator';
import * as apid from '../../../../../api';

@Component({})
export default class RecordedDetailTranscribeButton extends Vue {
    @Prop({ required: true })
    public recordedItem!: apid.RecordedItem;

    private recordedApiModel: IRecordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');
    private snackbarState: ISnackbarState = container.get<ISnackbarState>('ISnackbarState');

    public async requestTranscribe(): Promise<void> {
        try {
            await this.recordedApiModel.requestTranscribe(this.recordedItem.id);
            this.snackbarState.open({
                color: 'success',
                text: '文字起こしジョブを投入しました',
            });
        } catch (err) {
            this.snackbarState.open({
                color: 'error',
                text: '文字起こし要求に失敗しました',
            });
        }
    }
}
</script>

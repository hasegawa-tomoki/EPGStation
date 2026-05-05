<template>
    <v-main>
        <TitleBar title="視聴"></TitleBar>
        <transition name="page">
            <div class="video-container-wrap mx-auto">
                <VideoContainer v-if="videoParam !== null" ref="videoContainer" v-bind:videoParam="videoParam" v-bind:initialPosition="initialPosition"></VideoContainer>
                <WatchOnRecordedInfoCard v-if="recordedId !== null" v-bind:recordedId="recordedId"></WatchOnRecordedInfoCard>
                <div v-if="transcript !== null" class="mt-4 transcript-area">
                    <div class="subtitle-2 transcript-title">文字起こし</div>
                    <TranscriptViewer :text="transcript" v-on:play="onTimeClick" v-on:streaming="onTimeClick"></TranscriptViewer>
                </div>
                <div style="visibility: hidden">dummy</div>
            </div>
        </transition>
    </v-main>
</template>

<script lang="ts">
import TranscriptViewer from '@/components/recorded/detail/TranscriptViewer.vue';
import WatchOnRecordedInfoCard from '@/components/recorded/watch/WatchRecordedInfoCard.vue';
import TitleBar from '@/components/titleBar/TitleBar.vue';
import VideoContainer from '@/components/video/VideoContainer.vue';
import { BaseVideoParam, NormalVideoParam } from '@/components/video/ViedoParam';
import IRecordedApiModel from '@/model/api/recorded/IRecordedApiModel';
import container from '@/model/ModelContainer';
import IScrollPositionState from '@/model/state/IScrollPositionState';
import { Component, Vue, Watch } from 'vue-property-decorator';
import * as apid from '../../../api';

Component.registerHooks(['beforeRouteUpdate', 'beforeRouteLeave']);

@Component({
    components: {
        TitleBar,
        VideoContainer,
        WatchOnRecordedInfoCard,
        TranscriptViewer,
    },
})
export default class WatchRecorded extends Vue {
    public videoParam: BaseVideoParam | null = null;
    public recordedId: apid.RecordedId | null = null;
    public initialPosition: number = 0;
    public transcript: string | null = null;

    private scrollState: IScrollPositionState = container.get<IScrollPositionState>('IScrollPositionState');
    private recordedApiModel: IRecordedApiModel = container.get<IRecordedApiModel>('IRecordedApiModel');

    /**
     * TranscriptViewer の play / streaming emit を再生中の動画 seek に流用する
     * (再生画面では新規遷移ではなく現再生をその位置に seek するのが自然)
     */
    public onTimeClick(_video: any, startAt: number): void {
        if (typeof startAt !== 'number' || startAt <= 0) return;
        const vc = this.$refs.videoContainer as VideoContainer | undefined;
        if (typeof vc === 'undefined') return;
        vc.seekTo(startAt);
    }

    @Watch('$route', { immediate: true, deep: true })
    public onUrlChange(): void {
        // 視聴パラメータセット
        const videoId = typeof this.$route.query.videoId !== 'string' ? null : parseInt(this.$route.query.videoId, 10);
        this.recordedId = typeof this.$route.query.recordedId !== 'string' ? null : parseInt(this.$route.query.recordedId, 10);
        const t = typeof this.$route.query.t !== 'string' ? NaN : parseFloat(this.$route.query.t);
        this.initialPosition = Number.isFinite(t) && t > 0 ? t : 0;
        this.transcript = null;

        this.$nextTick(async () => {
            if (videoId !== null) {
                (this.videoParam as NormalVideoParam) = {
                    type: 'Normal',
                    src: `./api/videos/${videoId}`,
                };
            }

            if (this.recordedId !== null) {
                this.recordedApiModel
                    .getTranscript(this.recordedId)
                    .then(text => {
                        this.transcript = text;
                    })
                    .catch(() => {
                        this.transcript = null;
                    });
            }

            // データ取得完了を通知
            await this.scrollState.emitDoneGetData();
        });
    }
}
</script>

<style lang="sass" scoped>
.video-container-wrap
    max-width: 1200px

.transcript-area
    border-top: 1px solid rgba(0, 0, 0, 0.12)
    padding: 12px 8px

    .transcript-title
        font-weight: 600
        margin-bottom: 6px
        opacity: 0.7
</style>

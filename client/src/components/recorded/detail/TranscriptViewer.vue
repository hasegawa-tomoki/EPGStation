<template>
    <div class="transcript-viewer">
        <div v-for="(line, idx) in lines" :key="idx" class="transcript-line">
            <span v-if="line.startAt !== null" class="time-tag" v-on:click="onClickTime($event, line.startAt)">{{ line.time }}</span>
            <span v-else class="time-tag-plain">{{ line.time }}</span>
            <span v-if="line.speaker" class="speaker-tag" :style="{ color: speakerColor(line.speaker) }">({{ line.speaker }})</span>
            <span class="transcript-text">{{ line.body }}</span>
        </div>
        <v-menu v-model="isMenuOpen" :position-x="menuX" :position-y="menuY" absolute offset-y>
            <v-list dense>
                <v-subheader>{{ formatStartAt(currentStartAt) }} から</v-subheader>
                <template v-for="video in videoFiles">
                    <v-list-item :key="`play-${video.id}`" v-on:click="onPlay(video)">
                        <v-list-item-icon class="mr-3">
                            <v-icon small>mdi-play</v-icon>
                        </v-list-item-icon>
                        <v-list-item-content>
                            <v-list-item-title>{{ video.name }} を再生</v-list-item-title>
                        </v-list-item-content>
                    </v-list-item>
                    <v-list-item :key="`stream-${video.id}`" v-on:click="onStreaming(video)">
                        <v-list-item-icon class="mr-3">
                            <v-icon small>mdi-play-circle</v-icon>
                        </v-list-item-icon>
                        <v-list-item-content>
                            <v-list-item-title>{{ video.name }} をストリーミング</v-list-item-title>
                        </v-list-item-content>
                    </v-list-item>
                </template>
            </v-list>
        </v-menu>
    </div>
</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator';
import * as apid from '../../../../../api';

interface TranscriptLine {
    time: string;
    body: string;
    startAt: number | null;
    speaker: string | null;
}

const SPEAKER_PALETTE = ['#1976d2', '#d81b60', '#388e3c', '#f57c00', '#7b1fa2', '#0097a7', '#5d4037', '#c2185b'];

@Component({})
export default class TranscriptViewer extends Vue {
    @Prop({ required: true })
    public text!: string;

    @Prop({ required: false, default: () => [] })
    public videoFiles!: apid.VideoFile[];

    public lines: TranscriptLine[] = [];
    public isMenuOpen: boolean = false;
    public menuX: number = 0;
    public menuY: number = 0;
    public currentStartAt: number = 0;

    public created(): void {
        this.parse();
    }

    @Watch('text')
    public onTextChanged(): void {
        this.parse();
    }

    private parse(): void {
        const result: TranscriptLine[] = [];
        const re = /^(\[\s*(\d+(?:\.\d+)?)-\s*\d+(?:\.\d+)?\])\s?(?:\(([^)]+)\)\s?)?(.*)$/;
        const src = typeof this.text === 'string' ? this.text : '';
        for (const raw of src.split('\n')) {
            const m = raw.match(re);
            if (m !== null) {
                result.push({
                    time: m[1],
                    body: m[4],
                    startAt: parseFloat(m[2]),
                    speaker: m[3] ?? null,
                });
            } else {
                result.push({ time: raw, body: '', startAt: null, speaker: null });
            }
        }
        this.lines = result;
    }

    public speakerColor(speaker: string): string {
        let hash = 0;
        for (let i = 0; i < speaker.length; i++) {
            hash = (hash * 31 + speaker.charCodeAt(i)) >>> 0;
        }
        return SPEAKER_PALETTE[hash % SPEAKER_PALETTE.length];
    }

    public onClickTime(e: MouseEvent, startAt: number): void {
        e.preventDefault();
        e.stopPropagation();
        this.currentStartAt = startAt;
        // videoFiles が空 (=再生中画面など) のときは menu を出さず直接 seek を emit
        if (this.videoFiles.length === 0) {
            this.$emit('seek', startAt);
            this.$emit('play', null, startAt);
            return;
        }
        this.menuX = e.clientX;
        this.menuY = e.clientY;
        this.isMenuOpen = false;
        this.$nextTick(() => {
            this.isMenuOpen = true;
        });
    }

    public onPlay(video: apid.VideoFile): void {
        this.$emit('play', video, this.currentStartAt);
        this.isMenuOpen = false;
    }

    public onStreaming(video: apid.VideoFile): void {
        this.$emit('streaming', video, this.currentStartAt);
        this.isMenuOpen = false;
    }

    public formatStartAt(sec: number): string {
        const s = Math.max(0, Math.floor(sec));
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const ss = s % 60;
        const pad = (n: number): string => `0${n}`.slice(-2);
        return h > 0 ? `${h}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`;
    }
}
</script>

<style lang="sass" scoped>
.transcript-viewer
    font-family: monospace
    font-size: 12px
    line-height: 1.6

    .transcript-line
        white-space: pre-wrap
        word-break: break-word

    .time-tag
        color: #1976d2
        cursor: pointer
        user-select: none
        &:hover
            text-decoration: underline

    .time-tag-plain
        opacity: 0.6

    .speaker-tag
        margin-left: 4px
        font-weight: 600
</style>

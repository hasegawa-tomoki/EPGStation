<template>
    <v-card :ripple="false" flat tile class="d-flex my-1 recorded-small-card" v-bind:class="{ 'selected-color': item.isSelected === true }">
        <v-img
            v-if="!!noThumbnail === false"
            aspect-ratio="1.7778"
            :src="item.display.topThumbnailPath"
            v-on:error="this.src = './img/noimg.png'"
            v-on:click="gotoDetail"
            eager
            class="thumbnail"
        ></v-img>
        <div v-on:click="gotoDetail" class="content pa-2 my-auto">
            <div class="d-flex align-center">
                <span v-if="item.display.isExternal === true" class="nas-badge">NAS</span>
                <div class="text mt-1 subtitle-2 font-weight-bold">{{ item.display.name }}</div>
                <div v-if="isEditMode === false" class="menu-wrap">
                    <RecordedItemMenu :recordedItem="item.recordedItem" v-on:stopEncode="stopEncode"></RecordedItemMenu>
                </div>
            </div>
            <div class="text caption font-weight-light">{{ item.display.channelName }}</div>
            <div class="text caption font-weight-light">{{ item.display.time }} ({{ item.display.duration }} m)</div>
            <div v-if="typeof item.display.ruleId !== 'undefined'" class="text caption font-weight-light rule" v-on:click.stop="openRule">ルール: {{ item.display.ruleName }}</div>
            <div v-if="!!item.display.createdUser" class="text caption font-weight-light">作成: {{ item.display.createdUser }}</div>

            <div
                v-if="isShowDropInfo === true && typeof item.display.drop !== 'undefined'"
                class="text caption font-weight-light"
                v-bind:class="{ droped: item.display.hasDrop === true }"
            >
                {{ item.display.dropSimple }}
            </div>

            <div
                v-else-if="typeof item.display.description === 'undefined' || item.display.description.replace(/\s+/g, '').length === 0"
                class="text caption font-weight-light dummy"
            >
                dummy
            </div>
            <div v-else class="text caption font-regular">{{ item.display.description }}</div>
        </div>
    </v-card>
</template>

<script lang="ts">
import RecordedItemMenu from '@/components/recorded/RecordedItemMenu.vue';
import { RecordedDisplayData } from '@/model/state/recorded/IRecordedUtil';
import { Component, Prop, Vue } from 'vue-property-decorator';
import * as apid from '../../../../api';

@Component({
    components: {
        RecordedItemMenu,
    },
})
export default class RecordedSmallCard extends Vue {
    @Prop({ required: true })
    public item!: RecordedDisplayData;

    @Prop({ required: false })
    public noThumbnail: boolean | undefined;

    @Prop({ required: true })
    public isEditMode!: boolean;

    @Prop({ required: true })
    public isShowDropInfo!: boolean;

    public gotoDetail(): void {
        if (this.isEditMode === true) {
            this.$emit('selected', this.item.recordedItem.id);

            return;
        }
        this.$emit('detail', this.item.recordedItem.id);
    }

    public stopEncode(recordedId: apid.RecordedId): void {
        this.$emit('stopEncode', recordedId);
    }

    public openRule(): void {
        const ruleId = this.item.display.ruleId;
        if (typeof ruleId === 'undefined') {
            return;
        }
        this.$router.push({ path: '/recorded', query: { ruleId: ruleId.toString(10) } });
    }
}
</script>

<style lang="sass" scoped>
.recorded-small-card
    width: 100%
    height: 124px
    cursor: pointer

    .thumbnail
        flex-basis: 30%
        max-width: 200px
        border-bottom-left-radius: inherit
        border-top-right-radius: unset !important

    .content
        flex-basis: 100%
        min-width: 0
        overflow-wrap: break-word
        word-wrap: break-word
        .text
            overflow: hidden
            text-overflow: ellipsis
            white-space: nowrap
        .subtitle-2
            padding-right: 30px
        .dummy
            visibility: hidden

        .droped
            color: red
            font-weight: bold !important

        .rule
            text-decoration: underline

        .nas-badge
            display: inline-block
            flex-shrink: 0
            padding: 1px 4px
            margin-right: 6px
            font-size: 10px
            font-weight: 600
            line-height: 1.4
            color: rgba(0, 0, 0, 0.87)
            background-color: #FFCC80
            border-radius: 4px

    .menu-wrap
        position: absolute
        right: 0
        margin-top: 2px
        margin-right: 4px
</style>

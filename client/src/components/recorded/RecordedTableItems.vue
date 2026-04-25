<template>
    <v-card class="mx-auto recorded-list" max-width="1000px">
        <div
            v-for="(item, index) in items"
            v-bind:key="item.recordedItem.id"
            v-bind:class="{ 'selected-color': item.isSelected === true }"
            class="recorded-row"
            v-on:click="gotoDetail(item)"
        >
            <div class="d-flex pa-3 align-start">
                <div class="content">
                    <div class="meta caption text--secondary">
                        <span>{{ item.display.shortTime }}</span>
                        <span class="ml-2">({{ item.display.duration }}m)</span>
                        <span class="ml-2">{{ item.display.channelName }}</span>
                        <span v-if="typeof item.display.ruleId !== 'undefined'" class="ml-2 rule-link" v-on:click.stop="openRule(item)">
                            <v-icon class="rule-icon">mdi-calendar</v-icon>
                            {{ item.display.ruleName }}
                        </span>
                    </div>
                    <div class="name subtitle-1 font-weight-medium mt-1">
                        <span v-if="item.display.isExternal === true" class="nas-badge">NAS</span>
                        {{ item.display.name }}
                    </div>
                </div>
                <div class="menu ml-2">
                    <RecordedItemMenu v-if="isEditMode === false" :recordedItem="item.recordedItem" v-on:stopEncode="stopEncode"></RecordedItemMenu>
                </div>
            </div>
            <v-divider v-if="index < items.length - 1"></v-divider>
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
export default class RecordedTableItems extends Vue {
    @Prop({ required: true })
    public items!: RecordedDisplayData[];

    @Prop({ required: true })
    public isEditMode!: boolean;

    @Prop({ required: true })
    public isShowDropInfo!: boolean;

    public gotoDetail(item: RecordedDisplayData): void {
        if (this.isEditMode === true) {
            this.$emit('selected', item.recordedItem.id);

            return;
        }
        this.$emit('detail', item.recordedItem.id);
    }

    public stopEncode(recordedId: apid.RecordedId): void {
        this.$emit('stopEncode', recordedId);
    }

    public openRule(item: RecordedDisplayData): void {
        const ruleId = item.display.ruleId;
        if (typeof ruleId === 'undefined') {
            return;
        }
        this.$router.push({ path: '/recorded', query: { ruleId: ruleId.toString(10) } });
    }
}
</script>

<style lang="sass" scoped>
.recorded-list
    cursor: pointer

.recorded-row
    .content
        flex: 1 1 auto
        min-width: 0
    .menu
        flex: 0 0 auto

    .rule-link
        text-decoration: underline
    .rule-icon
        font-size: 16px !important
        padding-bottom: 2px

    .nas-badge
        display: inline-block
        padding: 1px 4px
        margin-right: 6px
        font-size: 10px
        font-weight: 600
        line-height: 1.4
        color: rgba(0, 0, 0, 0.87)
        background-color: #FFCC80
        border-radius: 4px
        vertical-align: middle
</style>

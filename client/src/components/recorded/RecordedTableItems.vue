<template>
    <v-card class="mx-auto recorded-table" max-width="1000px">
        <v-simple-table>
            <template v-slot:default>
                <thead>
                    <tr>
                        <th>タイトル</th>
                        <th class="channel">放送局</th>
                        <th class="time">時間</th>
                        <th class="rule">ルール</th>
                        <th class="menu"></th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="item in items" v-bind:key="item.id" v-on:click="gotoDetail(item)" v-bind:class="{ 'selected-color': item.isSelected === true }">
                        <td>
                            <span v-if="item.display.isExternal === true" class="nas-badge">NAS</span>
                            {{ item.display.name }}
                        </td>
                        <td>{{ item.display.channelName }}</td>
                        <td>{{ item.display.shortTime }} ({{ item.display.duration }} m)</td>
                        <td class="rule">
                            <span v-if="typeof item.display.ruleId !== 'undefined'" class="rule-link" v-on:click.stop="openRule(item)">{{ item.display.ruleName }}</span>
                        </td>
                        <td class="menu">
                            <RecordedItemMenu v-if="isEditMode === false" :recordedItem="item.recordedItem" v-on:stopEncode="stopEncode"></RecordedItemMenu>
                        </td>
                    </tr>
                </tbody>
            </template>
        </v-simple-table>
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
.recorded-table
    cursor: pointer
    .channel
        min-width: 180px
    .time
        width: 190px
    .rule
        max-width: 200px
        overflow: hidden
        text-overflow: ellipsis
        white-space: nowrap
        .rule-link
            text-decoration: underline
    .menu
        width: 68px
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

<template>
    <div>
        <div class="mx-auto reserves-list" style="max-width: 1600px">
            <v-card
                v-for="reserve in reserves"
                v-bind:key="reserve.reserveItem.id"
                v-bind:class="{ 'selected-color': reserve.isSelected === true }"
                class="reserve-item my-2"
                v-on:click="clickItem(reserve)"
            >
                <div class="d-flex pa-3 align-start">
                    <div class="left-col">
                        <div class="meta caption text--secondary">
                            <span>{{ reserve.display.day }}({{ reserve.display.dow }})</span>
                            <span class="ml-2">{{ reserve.display.startTime }}〜{{ reserve.display.endTime }}</span>
                            <span class="ml-2">({{ reserve.display.duration }}分)</span>
                            <span class="ml-2">{{ reserve.display.channelName }}</span>
                            <span v-if="reserve.display.isRule === true && reserve.display.ruleName" class="ml-2">
                                <v-icon class="reserve-icon">mdi-calendar</v-icon>
                                {{ reserve.display.ruleName }}
                            </span>
                        </div>
                        <div class="name subtitle-1 font-weight-medium mt-1">
                            <v-icon v-if="reserve.display.isRule === false" class="reserve-icon">mdi-timer-outline</v-icon>
                            {{ reserve.display.name }}
                        </div>
                    </div>
                    <div class="right-col body-2 text--secondary ml-4">{{ reserve.display.description }}</div>
                    <div class="menu-col ml-2">
                        <ReserveMenu v-if="isEditMode === false" :reserveItem="reserve.reserveItem" :disableEdit="false"></ReserveMenu>
                    </div>
                </div>
            </v-card>
        </div>
        <ReserveDialog :isOpen.sync="isOpenDialog" :reserve="dialogReserve"></ReserveDialog>
    </div>
</template>

<script lang="ts">
import ReserveDialog from '@/components/reserves/ReserveDialog.vue';
import ReserveMenu from '@/components/reserves/ReserveMenu.vue';
import { ReserveStateData } from '@/model/state/reserve/IReserveStateUtil';
import { Component, Prop, Vue } from 'vue-property-decorator';

@Component({
    components: {
        ReserveMenu,
        ReserveDialog,
    },
})
export default class ReservesTableItems extends Vue {
    @Prop({
        required: true,
    })
    public reserves!: ReserveStateData[];

    @Prop({ required: true })
    public isEditMode!: boolean;

    public isOpenDialog: boolean = false;
    public dialogReserve: ReserveStateData | null = null;

    public clickItem(reserve: ReserveStateData): void {
        if (this.isEditMode === true) {
            this.$emit('selected', reserve.reserveItem.id);

            return;
        }

        this.dialogReserve = reserve;
        this.isOpenDialog = true;
    }
}
</script>

<style lang="sass" scoped>
.reserves-list
    cursor: pointer

.reserve-item
    .left-col
        flex: 0 0 40%
        min-width: 0
    .right-col
        flex: 1 1 auto
        min-width: 0
        word-break: break-all
    .menu-col
        flex: 0 0 auto

    .reserve-icon
        font-size: 18px !important
        padding-bottom: 2px
</style>

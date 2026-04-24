<template>
    <div class="scroller" v-bind:class="{ 'is-draging': isDraging === true }" v-on:scroll="onScroll">
        <slot name="content"></slot>
    </div>
</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator';

// mousedown 位置から px 以下の移動はクリック扱い (ドラッグスクロール化しない)
const DRAG_THRESHOLD_PX = 6;

@Component({})
export default class GuideScroller extends Vue {
    public isDraging: boolean = false;

    private isPushed: boolean = false; // 押されているか
    private baseClientX: number = 0;
    private baseClientY: number = 0;
    private downClientX: number = 0; // mousedown 時の座標 (閾値判定用)
    private downClientY: number = 0;
    private clickTimer: number | undefined;

    // 各種イベントリスナー
    private mousedownListener = ((e: MouseEvent): void => {
        this.onMousedown(e);
    }).bind(this);
    private mouseupListener = ((): void => {
        this.onMouseup();
    }).bind(this);
    private mousemoveListener = ((e: MouseEvent): void => {
        this.onMousemove(e);
    }).bind(this);

    public mounted(): void {
        (this.$el as HTMLElement).addEventListener('mousedown', this.mousedownListener, false);
        document.addEventListener('mouseup', this.mouseupListener, false);
        document.addEventListener('mousemove', this.mousemoveListener, false);
    }

    public beforeDestroy(): void {
        (this.$el as HTMLElement).removeEventListener('mousedown', this.mousedownListener, false);
        document.removeEventListener('mouseup', this.mouseupListener, false);
        document.removeEventListener('mousemove', this.mousemoveListener, false);
    }

    public onScroll(e: Event): void {
        this.$emit('scroll', e);
    }

    public onMousedown(e: MouseEvent): void {
        this.isPushed = true;
        this.baseClientX = e.clientX;
        this.baseClientY = e.clientY;
        this.downClientX = e.clientX;
        this.downClientY = e.clientY;
    }

    public onMouseup(): void {
        this.isPushed = false;
    }

    public onMousemove(e: MouseEvent): void {
        if (this.isPushed === false) {
            return;
        }

        // まだドラッグ判定していないなら、mousedown 位置からの距離が閾値を超えるまで
        // クリック扱いのままにする (isDraging=false → pointer-events 通常 → click 発火)
        if (this.isDraging === false) {
            const dx = e.clientX - this.downClientX;
            const dy = e.clientY - this.downClientY;
            if (dx * dx + dy * dy <= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) {
                return;
            }
        }

        this.isDraging = true;

        this.$el.scrollLeft += this.baseClientX - e.clientX;
        this.$el.scrollTop += this.baseClientY - e.clientY;
        this.baseClientX = e.clientX;
        this.baseClientY = e.clientY;

        clearTimeout(this.clickTimer);
        this.clickTimer = setTimeout(() => {
            this.isDraging = false;
        }, 100);
    }
}
</script>

<style lang="sass" scoped>
.scroller
    user-select: none
    &.is-draging
        cursor: move
        > div
            pointer-events: none
</style>

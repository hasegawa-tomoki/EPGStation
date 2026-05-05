import { Location, Route } from 'vue-router';

export type NavigationType = 'permanent' | 'temporary' | 'default';

export interface NavigationItem {
    title: string;
    icon: string;
    herf: Location | null;
    badge?: number; // 件数バッジ (0 や undefined のときは非表示)
    badgeColor?: string;
    id?: string; // バッジ更新時の同定用キー (例: 'reserves')
}

export default interface INavigationState {
    openState: boolean | null;
    isClipped: boolean;
    type: NavigationType;
    items: NavigationItem[];
    navigationPosition: number;
    updateItems(currentRoute: Route): void;
    updateNavigationPosition(currentRoute: Route): void;
    toggle(): void;
    getItems(): NavigationItem[];
    setBadge(id: string, count: number): void;
}

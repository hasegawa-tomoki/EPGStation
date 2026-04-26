// tslint:disable-next-line:no-import-side-effect
import 'reflect-metadata';
import axios from 'axios';
import smoothscroll from 'smoothscroll-polyfill';
import Vue from 'vue';
import DatetimePicker from 'vuetify-datetime-picker';
import App from './App.vue';
import IChannelModel from './model/channels/IChannelModel';
import container from './model/ModelContainer';
import setter from './model/ModelContainerSetter';
import IPWAConfigModel from './model/pwa/IPWAConfigModel';
import IServerConfigModel from './model/serverConfig/IServerConfigModel';
import vuetify from './plugins/vuetify';
import router from './router';

setter(container);

smoothscroll.polyfill();

/**
 * 認証ステータスを確認。未ログインなら /login へ遷移して true を返す。
 */
async function ensureAuthenticated(): Promise<boolean> {
    try {
        await axios.get('./api/auth/me');
        return true;
    } catch (err: any) {
        if (err?.response?.status === 401) {
            const path = window.location.pathname + window.location.hash;
            // すでに /login にいるなら何もしない
            if (path.includes('/login') === false) {
                router.replace({ path: '/login', query: { redirect: path } }).catch(() => {});
            }
            return false;
        }
        // /api/auth/me が 404 (認証無効サーバ) なら認証不要として通す
        if (err?.response?.status === 404) {
            return true;
        }
        // ネットワークエラー等は通す (画面側で個別に出る)
        return true;
    }
}

/**
 * 401 を受けたら /login にリダイレクトする axios インターセプタ
 */
function setupAxiosInterceptor(): void {
    axios.interceptors.response.use(
        response => response,
        error => {
            const status = error?.response?.status;
            if (status === 401) {
                const path = window.location.pathname + window.location.hash;
                if (path.includes('/login') === false) {
                    router.replace({ path: '/login', query: { redirect: path } }).catch(() => {});
                }
            }
            return Promise.reject(error);
        },
    );
}

(async (): Promise<void> => {
    setupAxiosInterceptor();

    const authenticated = await ensureAuthenticated();

    if (authenticated === true) {
        // server config の取得
        const serverConfiModel = container.get<IServerConfigModel>('IServerConfigModel');
        await serverConfiModel.fetchConfig().catch(err => {
            console.error('get server config error');
            console.error(err);
        });

        // Web app 設定
        container.get<IPWAConfigModel>('IPWAConfigModel').setting();

        // 放送局情報の取得
        const channelModel = container.get<IChannelModel>('IChannelModel');
        await channelModel.fetchChannels().catch(err => {
            console.error('get channels error');
            console.error(err);
        });
    }

    Vue.config.productionTip = false;

    Vue.use(DatetimePicker);

    new Vue({
        router,
        vuetify,
        // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
        render: h => h(App),
    }).$mount('#app');
})();

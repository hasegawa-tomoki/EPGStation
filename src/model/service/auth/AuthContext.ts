import { AsyncLocalStorage } from 'async_hooks';

interface AuthContextStore {
    user: string | null;
}

const storage = new AsyncLocalStorage<AuthContextStore>();

/**
 * リクエスト/操作スコープで現在の認証ユーザを保持するコンテキスト。
 * trustedNetworks 経由や認証無効時は null。HTTP middleware で run() を呼ぶ。
 */
const AuthContext = {
    /**
     * コンテキスト内で fn を実行する。fn 内から getCurrentUser() で参照可能。
     */
    run<T>(user: string | null, fn: () => T): T {
        return storage.run({ user }, fn);
    },

    /**
     * 現在のスコープのユーザ名を返す。設定されていなければ null。
     */
    getCurrentUser(): string | null {
        const store = storage.getStore();
        return typeof store === 'undefined' ? null : store.user;
    },
};

export default AuthContext;

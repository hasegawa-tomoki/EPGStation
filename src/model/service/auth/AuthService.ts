import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as ipaddr from 'ipaddr.js';
import { AuthConfig, AuthUser } from '../../IConfigFile';

const DEFAULT_COOKIE_NAME = 'epgstation_auth';
const DEFAULT_COOKIE_MAX_AGE_SEC = 60 * 60 * 24 * 365; // 1 year
const SECRET_FILE = path.join(__dirname, '..', '..', '..', '..', 'data', 'auth.secret');
const BASIC_CACHE_TTL_MS = 5 * 60 * 1000;

interface ParsedCidr {
    addr: ipaddr.IPv4 | ipaddr.IPv6;
    bits: number;
}

export interface AuthSettings {
    secret: string;
    cookieName: string;
    cookieMaxAgeSec: number;
    users: AuthUser[];
    trustedCidrs: ParsedCidr[];
}

export default class AuthService {
    private settings: AuthSettings;
    private basicCache = new Map<string, { user: string; expiresAt: number }>();

    constructor(config: AuthConfig) {
        this.settings = {
            secret: AuthService.resolveSecret(config.secret),
            cookieName: config.cookieName ?? DEFAULT_COOKIE_NAME,
            cookieMaxAgeSec: config.cookieMaxAgeSec ?? DEFAULT_COOKIE_MAX_AGE_SEC,
            users: config.users ?? [],
            trustedCidrs: AuthService.parseCidrs(config.trustedNetworks ?? []),
        };
    }

    public getCookieName(): string {
        return this.settings.cookieName;
    }

    public getCookieMaxAgeSec(): number {
        return this.settings.cookieMaxAgeSec;
    }

    /**
     * 接続元 IP が信頼ネットワークに含まれるか
     */
    public isTrustedAddress(remoteAddr: string | undefined): boolean {
        if (typeof remoteAddr !== 'string' || remoteAddr.length === 0) {
            return false;
        }
        const stripped = AuthService.stripIpv6Prefix(remoteAddr);
        let parsed: ipaddr.IPv4 | ipaddr.IPv6;
        try {
            parsed = ipaddr.parse(stripped);
        } catch (_e) {
            return false;
        }
        for (const cidr of this.settings.trustedCidrs) {
            if (parsed.kind() === cidr.addr.kind() && (parsed as any).match(cidr.addr, cidr.bits)) {
                return true;
            }
        }
        return false;
    }

    /**
     * user/password を検証 (bcrypt or 平文)。OK なら user 名を返す。
     */
    public async verifyCredentials(user: string, password: string): Promise<string | null> {
        const found = this.settings.users.find(u => u.user === user);
        if (typeof found === 'undefined') {
            return null;
        }
        const stored = found.password ?? '';
        let ok = false;
        if (AuthService.isBcryptHash(stored)) {
            try {
                ok = await bcrypt.compare(password, stored);
            } catch (_e) {
                ok = false;
            }
        } else {
            // 定数時間比較
            ok = AuthService.timingSafeEqualStr(password, stored);
        }
        return ok ? found.user : null;
    }

    /**
     * cookie 用の署名付き token を発行する
     */
    public signToken(user: string): string {
        const exp = Math.floor(Date.now() / 1000) + this.settings.cookieMaxAgeSec;
        const payload = `${AuthService.b64url(user)}.${exp}`;
        const sig = AuthService.hmac(payload, this.settings.secret);
        return `${payload}.${sig}`;
    }

    /**
     * cookie の token を検証。OK なら user 名、失敗なら null。
     */
    public verifyToken(token: string | undefined): string | null {
        if (typeof token !== 'string' || token.length === 0) {
            return null;
        }
        const parts = token.split('.');
        if (parts.length !== 3) {
            return null;
        }
        const [encUser, expStr, sig] = parts;
        const payload = `${encUser}.${expStr}`;
        const expected = AuthService.hmac(payload, this.settings.secret);
        if (AuthService.timingSafeEqualStr(sig, expected) === false) {
            return null;
        }
        const exp = parseInt(expStr, 10);
        if (Number.isFinite(exp) === false || exp < Math.floor(Date.now() / 1000)) {
            return null;
        }
        try {
            return Buffer.from(encUser, 'base64url').toString('utf-8');
        } catch (_e) {
            return null;
        }
    }

    /**
     * Authorization ヘッダ (Basic) を検証。キャッシュ付き。
     */
    public async verifyBasicHeader(headerValue: string | undefined): Promise<string | null> {
        if (typeof headerValue !== 'string' || headerValue.startsWith('Basic ') === false) {
            return null;
        }
        const cached = this.basicCache.get(headerValue);
        if (typeof cached !== 'undefined' && cached.expiresAt > Date.now()) {
            return cached.user;
        }
        const decoded = Buffer.from(headerValue.slice(6), 'base64').toString('utf-8');
        const idx = decoded.indexOf(':');
        if (idx < 0) {
            return null;
        }
        const user = decoded.slice(0, idx);
        const password = decoded.slice(idx + 1);
        const verifiedUser = await this.verifyCredentials(user, password);
        if (verifiedUser !== null) {
            this.basicCache.set(headerValue, { user: verifiedUser, expiresAt: Date.now() + BASIC_CACHE_TTL_MS });
        }
        return verifiedUser;
    }

    private static resolveSecret(configSecret: string | undefined): string {
        if (typeof configSecret === 'string' && configSecret.length >= 16) {
            return configSecret;
        }
        try {
            const existing = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
            if (existing.length >= 16) {
                return existing;
            }
        } catch (_e) {
            // 後で生成する
        }
        const generated = crypto.randomBytes(32).toString('hex');
        try {
            fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
            fs.writeFileSync(SECRET_FILE, generated, { mode: 0o600 });
        } catch (e: any) {
            // 書込み失敗はログだけ。Secret はメモリ上で機能するが再起動で全 cookie 無効化される
            // eslint-disable-next-line no-console
            console.error(`failed to persist auth secret to ${SECRET_FILE}: ${e?.message ?? e}`);
        }
        return generated;
    }

    private static parseCidrs(input: string[]): ParsedCidr[] {
        const result: ParsedCidr[] = [];
        for (const raw of input) {
            try {
                const [addrStr, bitsStr] = raw.split('/');
                const addr = ipaddr.parse(addrStr);
                const bits =
                    typeof bitsStr === 'undefined' ? (addr.kind() === 'ipv4' ? 32 : 128) : parseInt(bitsStr, 10);
                if (Number.isFinite(bits) === false) {
                    continue;
                }
                result.push({ addr, bits });
            } catch (_e) {
                // skip invalid cidr silently
            }
        }
        return result;
    }

    private static isBcryptHash(s: string): boolean {
        return /^\$2[aby]\$/.test(s);
    }

    private static hmac(payload: string, secret: string): string {
        return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
    }

    private static b64url(s: string): string {
        return Buffer.from(s, 'utf-8').toString('base64url');
    }

    private static timingSafeEqualStr(a: string, b: string): boolean {
        const aBuf = Buffer.from(a);
        const bBuf = Buffer.from(b);
        if (aBuf.length !== bBuf.length) {
            return false;
        }
        return crypto.timingSafeEqual(aBuf, bBuf);
    }

    private static stripIpv6Prefix(addr: string): string {
        // ::ffff:192.168.1.1 形式の v4-mapped を素の v4 に変換
        if (addr.startsWith('::ffff:')) {
            const rest = addr.slice(7);
            if (rest.includes('.')) {
                return rest;
            }
        }
        return addr;
    }
}

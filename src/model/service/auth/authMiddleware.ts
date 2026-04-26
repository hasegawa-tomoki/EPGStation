import { NextFunction, Request, RequestHandler, Response } from 'express';
import AuthService from './AuthService';

const PUBLIC_API_PATHS = new Set(['/api/login', '/api/logout', '/api/auth/me']);
const PROTECTED_PREFIXES = ['/api/', '/streamfiles/', '/thumbnail/', '/api-docs/'];

export interface AuthMiddlewareOptions {
    subDirectory?: string;
}

/**
 * 保護対象パスかどうかを判定 (subDirectory を考慮)
 */
function isProtectedPath(reqPath: string, subDirectory: string): boolean {
    let p = reqPath;
    if (subDirectory.length > 0 && p.startsWith(subDirectory)) {
        p = p.slice(subDirectory.length);
    }
    if (p.length === 0 || p.startsWith('/') === false) {
        p = '/' + p;
    }
    if (PUBLIC_API_PATHS.has(p)) {
        return false;
    }
    return PROTECTED_PREFIXES.some(prefix => p.startsWith(prefix));
}

export function createAuthMiddleware(auth: AuthService, options: AuthMiddlewareOptions = {}): RequestHandler {
    const subDir = options.subDirectory ?? '';
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
        if (isProtectedPath(req.path, subDir) === false) {
            return next();
        }
        if (auth.isTrustedAddress(req.ip)) {
            return next();
        }
        // cookie
        const cookieName = auth.getCookieName();
        const token: string | undefined = (req as any).cookies?.[cookieName];
        const userFromCookie = auth.verifyToken(token);
        if (userFromCookie !== null) {
            (req as any).authUser = userFromCookie;
            return next();
        }
        // basic auth (VLC 等の外部プレーヤー用)
        const userFromBasic = await auth.verifyBasicHeader(req.headers.authorization);
        if (userFromBasic !== null) {
            (req as any).authUser = userFromBasic;
            return next();
        }
        // 未認証
        // ストリーミング系 / 外部プレーヤーは Basic challenge を返す。SPA の API は単に 401。
        const wantsBasic = req.path.includes('/streamfiles/') || req.path.includes('/api-docs/');
        if (wantsBasic === true) {
            res.setHeader('WWW-Authenticate', 'Basic realm="EPGStation"');
        }
        res.status(401).json({ code: 401, message: 'Unauthorized' });
    };
}

/**
 * SocketIO handshake 用の検証 (cookie ヘッダ + remote address)。
 * 失敗時は false を返す。
 */
export function verifySocketHandshake(
    auth: AuthService,
    cookieHeader: string | undefined,
    remoteAddress: string | undefined,
): boolean {
    if (auth.isTrustedAddress(remoteAddress)) {
        return true;
    }
    if (typeof cookieHeader !== 'string' || cookieHeader.length === 0) {
        return false;
    }
    const cookieName = auth.getCookieName();
    const cookies: { [k: string]: string } = {};
    for (const part of cookieHeader.split(';')) {
        const trimmed = part.trim();
        const eq = trimmed.indexOf('=');
        if (eq < 0) {
            continue;
        }
        const k = trimmed.slice(0, eq);
        const v = decodeURIComponent(trimmed.slice(eq + 1));
        cookies[k] = v;
    }
    return auth.verifyToken(cookies[cookieName]) !== null;
}

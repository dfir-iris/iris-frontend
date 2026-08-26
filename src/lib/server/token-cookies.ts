/**
 * Session-token cookie handling. Server-only.
 *
 * The refresh token is the credential worth protecting: it is long-lived
 * and mints new access tokens, so it lives ONLY in an HttpOnly cookie —
 * never in localStorage, never in a response body that reaches the
 * browser (see `promoteTokens`), and never in a request body the browser
 * sends (the proxy injects it, see `REFRESH_BODY_PATHS`).
 *
 * The access token is short-lived. It is mirrored into a cookie so the
 * proxy can authenticate requests made before any JS holds a token (the
 * boot-time /runtime-config fetch), and it is still returned in auth
 * response bodies because the Socket.IO connections for notifications and
 * chat connect straight to the backend and must pass a token themselves.
 */

export const COOKIE_ACCESS_TOKEN = 'iris_at';
export const COOKIE_REFRESH_TOKEN = 'iris_rt';

// Backend endpoints that read `refresh_token` from the JSON request body
// (see app/blueprints/rest/v2/auth.py). The browser no longer holds the
// refresh token, so the proxy injects it from the cookie on the way past.
export const REFRESH_BODY_PATHS = new Set([
	'/api/v2/auth/refresh-token',
	'/api/v2/auth/mfa-setup',
	'/api/v2/auth/mfa-verify'
]);

// Endpoints whose successful response carries a fresh token pair.
export const TOKEN_RESPONSE_PATHS = new Set([
	'/api/v2/auth/refresh-token',
	'/api/v2/auth/mfa-verify',
	'/api/v2/auth/oidc-exchange',
	'/api/v2/auth/login'
]);

export const LOGOUT_PATH = '/api/v2/auth/logout';

export interface RawTokens {
	access_token: string;
	refresh_token: string;
	access_token_expires_at: number;
	refresh_token_expires_at: number;
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
	if (!cookieHeader) return null;
	for (const part of cookieHeader.split(';')) {
		const eq = part.indexOf('=');
		if (eq === -1) continue;
		if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
	}
	return null;
}

/**
 * SameSite=Lax, not Strict: after the OIDC provider redirects the browser
 * back to /login?oidc=1 the cookies must survive that cross-site top-level
 * navigation. Strict drops them and the session is lost on every SSO login.
 */
export function buildSetCookie(
	name: string,
	value: string,
	maxAgeSeconds: number,
	secure: boolean
): string {
	return [
		`${name}=${value}`,
		'Path=/',
		`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
		'HttpOnly',
		'SameSite=Lax',
		secure ? 'Secure' : ''
	]
		.filter(Boolean)
		.join('; ');
}

export function clearTokenCookies(secure: boolean): string[] {
	return [
		buildSetCookie(COOKIE_ACCESS_TOKEN, '', 0, secure),
		buildSetCookie(COOKIE_REFRESH_TOKEN, '', 0, secure)
	];
}

/**
 * Add `refresh_token` to a JSON request body from the cookie value. Returns
 * the body unchanged if it isn't a JSON object — the backend will reject it
 * on its own terms rather than the proxy inventing a payload.
 */
export function injectRefreshToken(body: string, refreshToken: string): string {
	try {
		const parsed = body.trim() === '' ? {} : JSON.parse(body);
		if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return body;
		return JSON.stringify({ ...parsed, refresh_token: refreshToken });
	} catch {
		return body;
	}
}

/**
 * Promote a token pair from an auth response into HttpOnly cookies and
 * strip the refresh token from the body so it never reaches JS. The access
 * token is deliberately left in place for the Socket.IO handshake.
 *
 * Returns null when the payload carries no usable token pair, in which case
 * the caller should pass the original response through untouched.
 */
export function promoteTokens(
	rawBody: string,
	secure: boolean,
	nowSeconds: number = Math.floor(Date.now() / 1000)
): { body: string; cookies: string[] } | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(rawBody);
	} catch {
		return null;
	}
	if (parsed === null || typeof parsed !== 'object') return null;

	const root = parsed as Record<string, unknown>;
	// Tokens sit at the top level on /refresh-token and nested under
	// `responseData` on the login-shaped payloads.
	const container =
		root.tokens && typeof root.tokens === 'object'
			? root
			: root.responseData && typeof root.responseData === 'object'
				? (root.responseData as Record<string, unknown>)
				: null;

	if (!container) return null;

	const tokens = container.tokens as RawTokens | undefined;
	if (!tokens?.access_token || !tokens?.refresh_token) return null;

	const cookies = [
		buildSetCookie(
			COOKIE_ACCESS_TOKEN,
			tokens.access_token,
			tokens.access_token_expires_at - nowSeconds,
			secure
		),
		buildSetCookie(
			COOKIE_REFRESH_TOKEN,
			tokens.refresh_token,
			tokens.refresh_token_expires_at - nowSeconds,
			secure
		)
	];

	container.tokens = { ...tokens, refresh_token: '' };

	return { body: JSON.stringify(root), cookies };
}

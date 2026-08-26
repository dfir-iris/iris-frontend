import { describe, it, expect } from 'vitest';
import {
	COOKIE_ACCESS_TOKEN,
	COOKIE_REFRESH_TOKEN,
	buildSetCookie,
	clearTokenCookies,
	injectRefreshToken,
	promoteTokens,
	readCookie
} from '../token-cookies';

const NOW = 1_700_000_000;

const tokens = {
	access_token: 'ACCESS-XYZ',
	refresh_token: 'REFRESH-ABC',
	access_token_expires_at: NOW + 900,
	refresh_token_expires_at: NOW + 86_400
};

describe('readCookie', () => {
	it('reads a named cookie out of a header', () => {
		expect(readCookie('a=1; iris_rt=tok; b=2', 'iris_rt')).toBe('tok');
	});

	it('returns null when absent or when there is no header', () => {
		expect(readCookie('a=1', 'iris_rt')).toBeNull();
		expect(readCookie(null, 'iris_rt')).toBeNull();
	});

	it('does not match on a name that is only a suffix of another cookie', () => {
		expect(readCookie('x_iris_rt=nope', 'iris_rt')).toBeNull();
	});

	it('keeps base64url padding in the value intact', () => {
		expect(readCookie('iris_rt=aGVsbG8=', 'iris_rt')).toBe('aGVsbG8=');
	});
});

describe('buildSetCookie', () => {
	it('is HttpOnly and SameSite=Lax so the OIDC return navigation keeps it', () => {
		const c = buildSetCookie('iris_rt', 'v', 60, true);
		expect(c).toContain('HttpOnly');
		expect(c).toContain('SameSite=Lax');
		expect(c).not.toContain('SameSite=Strict');
		expect(c).toContain('Secure');
	});

	it('omits Secure on plain http so local/dev over http still works', () => {
		expect(buildSetCookie('iris_rt', 'v', 60, false)).not.toContain('Secure');
	});

	it('never emits a negative Max-Age', () => {
		expect(buildSetCookie('iris_rt', '', -500, true)).toContain('Max-Age=0');
	});
});

describe('clearTokenCookies', () => {
	it('expires both token cookies', () => {
		const cleared = clearTokenCookies(true);
		expect(cleared).toHaveLength(2);
		expect(cleared.every((c) => c.includes('Max-Age=0'))).toBe(true);
		expect(cleared.some((c) => c.startsWith(`${COOKIE_ACCESS_TOKEN}=`))).toBe(true);
		expect(cleared.some((c) => c.startsWith(`${COOKIE_REFRESH_TOKEN}=`))).toBe(true);
	});
});

describe('injectRefreshToken', () => {
	it('adds refresh_token to an empty body', () => {
		expect(JSON.parse(injectRefreshToken('{}', 'R'))).toEqual({ refresh_token: 'R' });
	});

	it('treats a blank body as an empty object', () => {
		expect(JSON.parse(injectRefreshToken('', 'R'))).toEqual({ refresh_token: 'R' });
	});

	it('preserves existing fields (mfa-verify sends a token alongside)', () => {
		expect(JSON.parse(injectRefreshToken('{"token":"123456"}', 'R'))).toEqual({
			token: '123456',
			refresh_token: 'R'
		});
	});

	it('overrides any client-supplied refresh_token with the cookie value', () => {
		expect(JSON.parse(injectRefreshToken('{"refresh_token":"FORGED"}', 'R'))).toEqual({
			refresh_token: 'R'
		});
	});

	it('leaves non-object bodies untouched rather than inventing a payload', () => {
		expect(injectRefreshToken('not json', 'R')).toBe('not json');
		expect(injectRefreshToken('[1,2]', 'R')).toBe('[1,2]');
	});
});

describe('promoteTokens', () => {
	it('strips the refresh token from a flat body but keeps the access token', () => {
		const result = promoteTokens(JSON.stringify({ tokens }), true, NOW);
		expect(result).not.toBeNull();

		const body = JSON.parse(result!.body);
		expect(body.tokens.refresh_token).toBe('');
		expect(body.tokens.access_token).toBe(tokens.access_token);
		expect(result!.body).not.toContain(tokens.refresh_token);
	});

	it('handles the login shape where tokens are nested under responseData', () => {
		const payload = { responseData: { user_name: 'admin', tokens } };
		const result = promoteTokens(JSON.stringify(payload), true, NOW);
		expect(result).not.toBeNull();

		const body = JSON.parse(result!.body);
		expect(body.responseData.tokens.refresh_token).toBe('');
		expect(body.responseData.user_name).toBe('admin');
		expect(result!.body).not.toContain(tokens.refresh_token);
	});

	it('sets both cookies with Max-Age derived from the expiry claims', () => {
		const result = promoteTokens(JSON.stringify({ tokens }), true, NOW);
		const access = result!.cookies.find((c) => c.startsWith(`${COOKIE_ACCESS_TOKEN}=`))!;
		const refresh = result!.cookies.find((c) => c.startsWith(`${COOKIE_REFRESH_TOKEN}=`))!;

		expect(access).toContain(`${COOKIE_ACCESS_TOKEN}=${tokens.access_token}`);
		expect(access).toContain('Max-Age=900');
		expect(refresh).toContain(`${COOKIE_REFRESH_TOKEN}=${tokens.refresh_token}`);
		expect(refresh).toContain('Max-Age=86400');
		expect(refresh).toContain('HttpOnly');
	});

	it('returns null for payloads with no token pair so the response passes through', () => {
		expect(promoteTokens(JSON.stringify({ message: 'ok' }), true, NOW)).toBeNull();
		expect(promoteTokens('not json', true, NOW)).toBeNull();
		expect(promoteTokens(JSON.stringify({ tokens: { access_token: 'a' } }), true, NOW)).toBeNull();
	});
});

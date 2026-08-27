import { ApiService } from '$lib/services/api.service';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isServerReachable } from '$lib/utils/server-health';
import { AuthService, type AuthSettings } from '$lib/services/auth.service';
import { COOKIE_ACCESS_TOKEN, COOKIE_REFRESH_TOKEN } from '$lib/server/token-cookies';

// Safe defaults for when `/manage/server/authentication-settings` is
// unreachable or returns a non-JSON body. Without this, the login page
// crashes (`Cannot read properties of null (reading 'oidc_enabled')`)
// the moment the backend is briefly down or hidden behind a misrouted
// proxy — which makes the outage worse: the user can't even see the
// login form to retry. Default to "local auth only, MFA off" so the
// classic username/password form still renders.
const DEFAULT_AUTH_SETTINGS: AuthSettings = {
	oidc_enabled: false,
	mfa_enabled: false,
	local_fallback_enabled: true,
	demo_mode: false,
	demo_accounts: []
};

/**
 * Validate a `?redirect=` target before sending a freshly-authenticated user
 * to it.
 *
 * Two things to reject:
 *  - Anything that isn't a plain same-origin path. A value carrying a scheme
 *    or an authority (`//evil.com`, `https://evil.com`) is an open-redirect,
 *    and browsers treat a leading `//` as protocol-relative.
 *  - Anything pointing back at /login. Bouncing a logged-in user to the login
 *    page restarts the whole cycle; historic nested URLs are exactly this
 *    shape, so honouring them would keep poisoned bookmarks broken forever.
 */
const safeRedirect = (raw: string | null): string => {
	if (!raw) return '/';
	// Reject control characters and backslashes: some browsers normalise `\`
	// to `/`, which turns `/\evil.com` into a protocol-relative URL.
	// eslint-disable-next-line no-control-regex
	if (/[\u0000-\u001f\u007f\\]/.test(raw)) return '/';
	if (!raw.startsWith('/') || raw.startsWith('//')) return '/';

	const path = raw.split('?')[0].split('#')[0];
	if (path === '/login' || path.startsWith('/login/')) return '/';

	return raw;
};

export const load: PageServerLoad = async () => {
	const isReachable = await isServerReachable();

	let authSettings: AuthSettings = DEFAULT_AUTH_SETTINGS;
	try {
		const fetched = await AuthService.getAuthSettings();
		if (fetched && typeof fetched === 'object') {
			authSettings = {
				oidc_enabled: Boolean(fetched.oidc_enabled),
				mfa_enabled: Boolean(fetched.mfa_enabled),
				local_fallback_enabled:
					fetched.local_fallback_enabled === undefined
						? true
						: Boolean(fetched.local_fallback_enabled),
				demo_mode: Boolean(fetched.demo_mode),
				demo_accounts: Array.isArray(fetched.demo_accounts) ? fetched.demo_accounts : []
			};
		} else {
			console.warn(
				'[login] authentication-settings returned a non-object payload; ' +
					'falling back to local-auth defaults'
			);
		}
	} catch (err) {
		console.warn(
			'[login] failed to load authentication-settings; falling back to ' +
				'local-auth defaults. Error:',
			err
		);
	}

	return {
		authSettings,
		serverStatus: isReachable ? 'online' : 'offline',
		serverCheckMessage: isReachable
			? `Server is online at ${ApiService.baseUrl}`
			: `Cannot connect to server at ${ApiService.baseUrl}`
	};
};

export const actions = {
	default: async ({ request, url, cookies }) => {
		const data = await request.formData();
		const redirectTo = safeRedirect(url.searchParams.get('redirect'));
		const username = data.get('username') as string;
		const password = data.get('password') as string;

		try {
			const responseData = await AuthService.login({ username, password });

			// This action runs server-side, so `AuthService.login` talks to the
			// backend over the internal network (`apiOrigin()` is the internal
			// base on the server) and never passes through the proxy in
			// hooks.server.ts. The token cookies therefore have to be set here
			// — the proxy only sees requests the *browser* makes.
			const t = responseData.tokens;
			const now = Math.floor(Date.now() / 1000);
			const secure = url.protocol === 'https:';

			cookies.set(COOKIE_ACCESS_TOKEN, t.access_token, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure,
				maxAge: Math.max(0, t.access_token_expires_at - now)
			});
			cookies.set(COOKIE_REFRESH_TOKEN, t.refresh_token, {
				path: '/',
				httpOnly: true,
				sameSite: 'lax',
				secure,
				maxAge: Math.max(0, t.refresh_token_expires_at - now)
			});

			// Everything returned here is serialised into the page payload and
			// is readable by JS, so the refresh token must not travel with it.
			// The access token does: the Socket.IO handshake needs one in hand.
			const tokenInfo = {
				accessToken: t.access_token,
				refreshToken: '',
				accessTokenExpiresAt: t.access_token_expires_at,
				refreshTokenExpiresAt: t.refresh_token_expires_at
			};

			return {
				ok: true,
				redirectTo,
				responseData: {
					...responseData,
					tokens: { ...t, refresh_token: '' }
				},
				tokenInfo
			};
		} catch (error: unknown) {
			console.error('User', username, 'sign in error: ', error);
			return fail(400, {
				error: (error as Error).message,
				username,
				connectionError: true
			});
		}
	}
} satisfies Actions;

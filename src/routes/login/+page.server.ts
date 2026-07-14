import { ApiService } from '$lib/services/api.service';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isServerReachable } from '$lib/utils/server-health';
import { AuthService, type AuthSettings } from '$lib/services/auth.service';

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
	local_fallback_enabled: true
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
						: Boolean(fetched.local_fallback_enabled)
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
	default: async ({ request, url }) => {
		const data = await request.formData();
		const redirectTo = url.searchParams.get('redirect') || '/';
		const username = data.get('username') as string;
		const password = data.get('password') as string;

		try {
			const responseData = await AuthService.login({ username, password });

			const tokenInfo = {
				accessToken: responseData.tokens.access_token,
				refreshToken: responseData.tokens.refresh_token,
				accessTokenExpiresAt: responseData.tokens.access_token_expires_at,
				refreshTokenExpiresAt: responseData.tokens.refresh_token_expires_at
			};

			return {
				ok: true,
				redirectTo,
				responseData,
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

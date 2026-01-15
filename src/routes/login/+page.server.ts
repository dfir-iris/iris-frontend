import { ApiService } from '$lib/services/api.service';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isServerReachable } from '$lib/utils/server-health';
import { AuthService } from '$lib/services/auth.service';

export const load: PageServerLoad = async () => {
	const isReachable = await isServerReachable();
	const authSettings = await AuthService.getAuthSettings();

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
				error: 'Could not connect to the authentication server. Please try again later.',
				username,
				connectionError: true
			});
		}
	}
} satisfies Actions;

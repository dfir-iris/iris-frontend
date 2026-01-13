// src/routes/login/+page.server.ts
import { ApiService } from '$lib/services/api.service';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { isServerReachable } from '$lib/utils/server-health';
import type { LoginResponse } from '$lib/services/auth.service';
import type { TokenInfo } from '$lib/stores/auth.store';

export const load: PageServerLoad = async () => {
	const isReachable = await isServerReachable();

	return {
		serverStatus: isReachable ? 'online' : 'offline',
		serverCheckMessage: isReachable
			? `Server is online at ${ApiService.baseUrl}`
			: `Cannot connect to server at ${ApiService.baseUrl}`
	};
};

export const actions = {
	default: async ({ request, url, fetch }) => {
		const data = await request.formData();
		const redirectTo = url.searchParams.get('redirect') || '/';
		const username = data.get('username') as string;
		const password = data.get('password') as string;

		try {
			console.log('User', username, 'signing in...');

			const loginEndpoints = ['/api/v2/auth/login'];

			let response;
			let error;

			for (const endpoint of loginEndpoints) {
				try {
					console.log(`Attempting login with endpoint: ${endpoint}`);
					response = await ApiService.post<LoginResponse>(
						endpoint,
						{ username, password },
						{ fetch, skipAuthRedirect: true, useApiPrefix: false }
					);
					console.log(`Login successful with endpoint: ${endpoint}`);
					break;
				} catch (e) {
					error = e;
					console.warn(`Login attempt failed with endpoint ${endpoint}:`, e);
				}
			}

			if (!response) throw error || new Error('All login attempts failed');

			const responseData = response.data as LoginResponse;

			if (response.status !== 200 || !responseData.tokens?.access_token) {
				return fail(response.status, {
					error: 'Authentication failed. Please check your username and password.',
					username
				});
			}

			const tokenInfo: TokenInfo = {
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
		} catch (error) {
			console.error('User', username, 'sign in error: ', error);
			return fail(400, {
				error: 'Could not connect to the authentication server. Please try again later.',
				username,
				connectionError: true
			});
		}
	}
} satisfies Actions;

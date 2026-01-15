import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.store';
import { ApiService } from './api.service';

interface LoginCredentials {
	username: string;
	password: string;
}

interface RefreshTokens {
	access_token: string;
	refresh_token: string;
	access_token_expires_at: number;
	refresh_token_expires_at: number;
}

interface RefreshTokens {
	tokens: RefreshTokens;
}

export interface LoginResponse extends RefreshTokens {
	success: boolean;
	redirect?: string;
	user_name: string;
	user_login: string;
	user_email: string;
	user_is_service_account: boolean;
	id: number;
	uuid: string;
	active: boolean;
	external_id: string | null;
	in_dark_mode: boolean;
	has_mini_sidebar: boolean;
	has_deletion_confirmation: boolean;
	mfa_setup_complete: boolean;
}

export interface WhoamiResponse {
	responseData: LoginResponse;
	tokenInfo: RefreshTokens;
}

export interface AuthSettings {
	oidc_enabled: boolean;
	mfa_enabled: boolean;
}

class AuthenticationService {
	async getAuthSettings(): Promise<AuthSettings> {
		const response = await ApiService.get<AuthSettings>(
			'/api/v2/manage/server/authentication-settings',
			{ skipTokenRefresh: true }
		);

		return response.data as AuthSettings;
	}

	async login(credentials?: LoginCredentials): Promise<LoginResponse> {
		try {
			const response = await ApiService.post<LoginResponse>(
				'/api/v2/auth/login',
				{
					...credentials
				},
				{ skipTokenRefresh: true }
			);

			if (!response.ok) {
				throw new Error(response.error ? response.error.message : 'Authentication failed');
			}

			const responseData = response.data as LoginResponse;

			// Extract token information
			const tokenInfo = {
				accessToken: responseData.tokens.access_token,
				refreshToken: responseData.tokens.refresh_token,
				accessTokenExpiresAt: responseData.tokens.access_token_expires_at,
				refreshTokenExpiresAt: responseData.tokens.refresh_token_expires_at
			};

			// Update the auth store with user data and tokens
			auth.setAuth(responseData, tokenInfo);

			return responseData;
		} catch (error: unknown) {
			console.error('Login error:', (error as Error).message);

			throw error;
		}
	}

	async logout() {
		try {
			await ApiService.post('/api/v2/auth/logout', {});
		} catch (error: unknown) {
			console.error('Logout error:', (error as Error).message);
		} finally {
			// Clear user data from store
			auth.clearAuth();

			// Redirect to login
			if (browser) {
				goto('/login');
			}
		}
	}

	async refreshToken() {
		try {
			console.log('Refreshing token...');

			const response = await ApiService.post<RefreshTokens>(
				'/api/v2/auth/refresh-token',
				{
					refresh_token: auth.getRefreshToken()
				},
				{
					skipAuthRedirect: true,
					skipTokenRefresh: true
				}
			);

			if (!response.ok) {
				console.error('Token refresh failed:', response.error ? response.error.message : 'Unknown');

				throw new Error('Failed to refresh token');
			}

			const refreshData = response.data as RefreshTokens;

			// Update tokens in auth store
			if (refreshData.tokens) {
				auth.updateTokens({
					accessToken: refreshData.tokens.access_token,
					refreshToken: refreshData.tokens.refresh_token,
					accessTokenExpiresAt: refreshData.tokens.access_token_expires_at,
					refreshTokenExpiresAt: refreshData.tokens.refresh_token_expires_at
				});
			}

			return refreshData;
		} catch (error: unknown) {
			console.error('Token refresh error:', error);
			// If refresh fails, redirect to login
			auth.clearAuth();
			// this.logout();
			throw error;
		}
	}

	async whoami() {
		try {
			const response = await ApiService.get<WhoamiResponse>('/api/v2/auth/whoami');

			return response.data as WhoamiResponse;
		} catch (error: unknown) {
			console.error('Logout error:', (error as Error).message);
		}
	}
}

export const AuthService = new AuthenticationService();

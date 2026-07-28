import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.store';
import { ApiService } from './api.service';

interface LoginCredentials {
	username: string;
	password: string;
}

export interface RefreshTokens {
	access_token: string;
	refresh_token: string;
	access_token_expires_at: number;
	refresh_token_expires_at: number;
}

export interface RefreshTokensResponse {
	tokens: RefreshTokens;
}

export interface UserInfo {
	id?: number;
	user_id?: number;
	user_name: string;
	user_login: string;
	user_email: string;
}

export interface LoginResponse extends UserInfo {
	success: boolean;
	redirect?: string;
	user_is_service_account: boolean;
	uuid: string;
	active: boolean;
	external_id: string | null;
	in_dark_mode: boolean;
	has_mini_sidebar: boolean;
	has_deletion_confirmation: boolean;
	mfa_setup_complete: boolean;
	// Optional for backward compatibility with backends that don't return
	// it inline. The login page falls back to `authSettings.mfa_enabled`
	// when this is undefined.
	mfa_required?: boolean;
	tokens: RefreshTokens;
}

export interface WhoamiResponse {
	responseData: LoginResponse;
	tokenInfo: RefreshTokens;
}

export interface MfaVerifyResponse {
	mfa_verified: boolean;
	tokens?: RefreshTokens;
}

export interface AuthSettings {
	oidc_enabled: boolean;
	mfa_enabled: boolean;
	local_fallback_enabled: boolean;
}

class AuthenticationService {
	// Dedup guard for `refreshToken`. On a browser refresh the SPA fires
	// ~10 concurrent API calls (whoami, runtime-config, permissions, cases,
	// alerts, notifications, ...). If the access token is expired, each
	// request's pre-flight check in `ApiService.request` calls
	// `refreshToken()` independently. Without dedup, all N fire at the
	// same time; they race on `auth.updateTokens(...)` and any transient
	// failure on the slower ones used to trigger `auth.clearAuth() +
	// goto('/login')`, logging the user out mid-page-load — most visible
	// on SSO installs where the access token is short-lived and the
	// browser-refresh path is the only place N-way parallelism happens.
	private refreshInflight: Promise<RefreshTokensResponse | null> | null = null;

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

	/**
	 * Trade the one-time OIDC session cookie set by the Flask
	 * /oidc-authorize callback for JWT access + refresh tokens.
	 *
	 * The cookie is sent automatically because this is a same-origin
	 * POST. The backend clears the session immediately after minting
	 * tokens, so this call is single-use: a page refresh (or replay)
	 * after success will get a 403.
	 */
	async oidcExchange(): Promise<LoginResponse> {
		const response = await ApiService.post<LoginResponse>(
			'/api/v2/auth/oidc-exchange',
			{},
			{ skipTokenRefresh: true }
		);

		if (!response.ok) {
			throw new Error(response.error ? response.error.message : 'OIDC exchange failed');
		}

		const responseData = response.data as LoginResponse;

		const tokenInfo = {
			accessToken: responseData.tokens.access_token,
			refreshToken: responseData.tokens.refresh_token,
			accessTokenExpiresAt: responseData.tokens.access_token_expires_at,
			refreshTokenExpiresAt: responseData.tokens.refresh_token_expires_at
		};

		auth.setAuth(responseData, tokenInfo);

		return responseData;
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

	async refreshToken(): Promise<RefreshTokensResponse | null> {
		// Concurrent callers share the same in-flight promise: exactly one
		// POST /api/v2/auth/refresh-token, and all callers see the same
		// success/failure outcome. Returns null on failure so the caller
		// can react (the ApiService 401 retry path fires the
		// `session-expired` event) — we do NOT call `auth.clearAuth()` or
		// `goto('/login')` here; that used to log users out on any
		// transient refresh hiccup during a page reload.
		if (this.refreshInflight) return this.refreshInflight;

		this.refreshInflight = (async () => {
			try {
				console.log('Refreshing token...');

				const response = await ApiService.post<RefreshTokensResponse>(
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
					console.error(
						'Token refresh failed:',
						response.error ? response.error.message : 'Unknown'
					);
					return null;
				}

				const refreshData = response.data as RefreshTokensResponse;

				if (refreshData?.tokens) {
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
				return null;
			} finally {
				this.refreshInflight = null;
			}
		})();

		return this.refreshInflight;
	}

	async whoami() {
		try {
			const response = await ApiService.get<WhoamiResponse>('/api/v2/auth/whoami');

			return response.data as WhoamiResponse;
		} catch (error: unknown) {
			console.error('Whoami error:', (error as Error).message);
		}
	}

	async setupMfa(password: string, token: string, mfaSecret: string): Promise<void> {
		const response = await ApiService.post(
			'/api/v2/auth/mfa-setup',
			{
				refresh_token: auth.getRefreshToken(),
				password,
				token,
				mfa_secret: mfaSecret
			},
			{ fetch }
		);

		if (!response.ok) {
			throw new Error(response.error?.message ?? 'Failed to setup MFA');
		}

		auth.setMfaSetupComplete(true);
		auth.setMfaVerified(false);
	}

	async verifyMfa(token: string): Promise<void> {
		const response = await ApiService.post<MfaVerifyResponse>(
			'/api/v2/auth/mfa-verify',
			{
				refresh_token: auth.getRefreshToken(),
				token: token.replace(/\s+/g, '')
			},
			{ fetch }
		);

		if (!response.ok) {
			throw new Error(response.error?.message ?? 'MFA verification failed');
		}

		const data = response.data as MfaVerifyResponse;

		if (data.tokens) {
			auth.updateTokens({
				accessToken: data.tokens.access_token,
				refreshToken: data.tokens.refresh_token,
				accessTokenExpiresAt: data.tokens.access_token_expires_at,
				refreshTokenExpiresAt: data.tokens.refresh_token_expires_at
			});
		}

		auth.setMfaVerified(true);
	}

	setMfaVerified(verified: boolean) {
		auth.setMfaVerified(verified);
	}
}

export const AuthService = new AuthenticationService();

import { writable, derived, get } from 'svelte/store';
import type { LoginResponse } from '$lib/services/auth.service';
import { ApiService } from '$lib/services/api.service';
import { redirect } from '@sveltejs/kit';
import { browser } from '$app/environment';

// Token storage keys.
//
// Only expiry timestamps are persisted — they are plain integers with no
// authentication value. The tokens themselves are never written to
// localStorage: the refresh token lives solely in an HttpOnly cookie, and
// the access token is held in memory for the lifetime of the page (see
// `$lib/server/token-cookies`).
const TOKEN_EXPIRY_KEY = 'iris_token_expiry';
const REFRESH_EXPIRY_KEY = 'iris_refresh_expiry';
const MFA_VERIFIED_KEY = 'iris_mfa_verified';

export interface TokenInfo {
	accessToken: string;
	refreshToken: string;
	accessTokenExpiresAt: number;
	refreshTokenExpiresAt: number;
}

interface AuthState {
	user: LoginResponse | null;
	tokens: TokenInfo | null;
	mfaEnabled: boolean;
	mfaVerified: boolean;
}

function loadInitialState(): AuthState {
	if (!browser) {
		return { user: null, tokens: null, mfaEnabled: false, mfaVerified: false };
	}

	// Only the expiry timestamps survive a reload; the tokens do not.
	const accessTokenExpiresAt = localStorage.getItem(TOKEN_EXPIRY_KEY);
	const refreshTokenExpiresAt = localStorage.getItem(REFRESH_EXPIRY_KEY);
	const mfaVerified = localStorage.getItem(MFA_VERIFIED_KEY) === 'true';

	if (accessTokenExpiresAt && refreshTokenExpiresAt) {
		return {
			user: null, // We don't have user data yet, will be loaded later
			mfaEnabled: false,
			mfaVerified,
			tokens: {
				// The page just loaded, so no access token is in memory yet.
				// `accessTokenExpiresAt: 0` marks it expired, which makes the
				// pre-flight check in ApiService refresh once on the first API
				// call. That refresh returns an access token in the response
				// body and repopulates memory before the notification/chat
				// sockets connect (`notifications.initialize` awaits an API
				// call before `connectSocket`).
				accessToken: '',
				refreshToken: '',
				accessTokenExpiresAt: 0,
				refreshTokenExpiresAt: Number(refreshTokenExpiresAt)
			}
		};
	}

	return { user: null, tokens: null, mfaEnabled: false, mfaVerified: false };
}

function saveTokensToStorage(tokens: TokenInfo) {
	if (!browser) return;

	localStorage.setItem(TOKEN_EXPIRY_KEY, tokens.accessTokenExpiresAt.toString());
	localStorage.setItem(REFRESH_EXPIRY_KEY, tokens.refreshTokenExpiresAt.toString());
}

function clearTokensFromStorage() {
	if (!browser) return;

	localStorage.removeItem(TOKEN_EXPIRY_KEY);
	localStorage.removeItem(REFRESH_EXPIRY_KEY);
}

function normalizeUser(payload: unknown): LoginResponse | null {
	if (!payload) return null;

	if (typeof payload === 'object' && payload !== null && 'responseData' in payload) {
		const rd = (payload as { responseData?: unknown }).responseData;
		return (rd as LoginResponse) ?? null;
	}

	return payload as LoginResponse;
}

const createAuthStore = () => {
	const { subscribe, set, update } = writable<AuthState>(loadInitialState());

	// Dedup guard for `loadAuth`. Both the root layout effect and the
	// sidebar's UserMenu effect used to fire `loadAuth` on mount, racing
	// each other's `/whoami` + token-refresh calls. If the token was
	// close to expiry, the slower caller would arrive at /auth/refresh-
	// token with a rotated refresh token, get a 401, and call
	// `clearAuth()` — wiping the user state the first call had just
	// populated. Cache the in-flight promise so concurrent callers
	// share the result.
	let loadAuthInflight: Promise<LoginResponse | null> | null = null;

	const store = {
		subscribe,
		setAuth: (response: LoginResponse, tokens: TokenInfo, mfaEnabled?: boolean) => {
			// Save tokens to storage
			saveTokensToStorage(tokens);

			// New login -> MFA must be verified again (if enabled)
			if (browser) {
				localStorage.removeItem(MFA_VERIFIED_KEY);
			}

			update((state) => ({
				user: normalizeUser(response),
				mfaEnabled: mfaEnabled ?? state.mfaEnabled ?? false,
				mfaVerified: false,
				tokens
			}));
		},
		clearAuth: () => {
			// Clear tokens from storage
			clearTokensFromStorage();

			if (browser) {
				localStorage.removeItem(MFA_VERIFIED_KEY);
			}

			const newState: AuthState = {
				user: null,
				mfaEnabled: false,
				mfaVerified: false,
				tokens: null
			};

			set(newState);
		},
		updateTokens: (tokens: TokenInfo) => {
			saveTokensToStorage(tokens);

			update((state) => ({
				...state,
				tokens
			}));
		},
		setMfaEnabled: (mfaEnabled: boolean) => {
			update((state) => ({ ...state, mfaEnabled }));
		},
		setMfaVerified: (mfaVerified: boolean) => {
			if (browser) {
				localStorage.setItem(MFA_VERIFIED_KEY, mfaVerified ? 'true' : 'false');
			}

			update((state) => ({ ...state, mfaVerified }));
		},
		getMfaVerified: (): boolean => {
			const current = get(store);
			return current.mfaVerified;
		},
		isAuthenticated: () => {
			const current = get(store);

			const isAuthenticated = current.mfaEnabled
				? !!current.user?.mfa_setup_complete && current.mfaVerified
				: !!current.user;

			return isAuthenticated;
		},
		loadAuth: async (
			fetchFn: typeof fetch,
			redirectOnFailure = false
		): Promise<LoginResponse | null> => {
			const current = get(store);

			// Already have user data
			if (current.user) return current.user;

			// A second caller arrived while the first /whoami is still
			// in flight — share its result instead of racing.
			if (loadAuthInflight) return loadAuthInflight;

			// Check if we have valid tokens
			if (!current.tokens) return null;

			loadAuthInflight = (async () => {
				try {
					// No hand-set Authorization header — let ApiService's
					// pre-flight refresh + header injection run. Setting it
					// here bypasses the pre-flight and races the parallel
					// refresh-token rotation kicked off by other reload-time
					// callers (cases.load, userCtx.load, runtime-config,
					// notifications, ...), so whoami would fire with a stale
					// access token, its own retry path would race the same
					// refresh, and on the losing side loadAuth would redirect
					// to /login.
					const response = await ApiService.get<LoginResponse>('/api/v2/auth/whoami', {
						fetch: fetchFn
					});

					const fresh = normalizeUser(response.data as LoginResponse);

					if (fresh) {
						update((state) => ({ ...state, user: fresh }));
						return fresh;
					}

					// `whoami` returned no usable user payload (4xx /
					// network error). Only wipe global auth for callers
					// that explicitly need it for routing — otherwise
					// a transient failure on a background loader would
					// log the user out across the whole app.
					if (redirectOnFailure) {
						store.clearAuth();
						throw redirect(302, '/login');
					}

					return null;
				} catch (error) {
					console.error('loadAuth failed:', error);

					if (redirectOnFailure) {
						store.clearAuth();
						throw redirect(302, '/login');
					}

					return null;
				} finally {
					loadAuthInflight = null;
				}
			})();

			return loadAuthInflight;
		},
		getMfaEnabled: (): boolean => {
			const current = get(store);
			return current.mfaEnabled;
		},
		setMfaSetupComplete: (complete: boolean) => {
			update((state) => ({
				...state,
				user: normalizeUser(
					state.user ? { ...state.user, mfa_setup_complete: complete } : state.user
				)
			}));
		},
		getMfaSetupComplete: (): boolean => {
			const current = get(store);
			return current.user?.mfa_setup_complete || false;
		},
		getAccessToken: (): string | null => {
			const current = get(store);
			return current.tokens?.accessToken || null;
		},
		getRefreshToken: (): string | null => {
			const current = get(store);
			return current.tokens?.refreshToken || null;
		},
		isTokenExpired: (): boolean => {
			const current = get(store);
			if (!current.tokens) return true;

			// Add a 30-second buffer to handle timing issues
			const now = Date.now() / 1000 + 30;
			return current.tokens.accessTokenExpiresAt < now;
		},
		isRefreshTokenExpired: (): boolean => {
			const current = get(store);
			if (!current.tokens) return true;

			const now = Date.now() / 1000;
			return current.tokens.refreshTokenExpiresAt < now;
		}
	};

	return store;
};

export const auth = createAuthStore();

// Derived stores for user name and full user info
export const username = derived(auth, ($auth) => $auth.user?.user_name ?? 'Loading...');
export const current_user = derived(auth, ($auth) => $auth.user ?? null);
export const mfa_verified = derived(auth, ($auth) => $auth.mfaVerified);

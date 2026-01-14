import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('@sveltejs/kit', () => ({ redirect: vi.fn() }));
vi.mock('$lib/services/api.service', () => ({
	ApiService: {
		get: vi.fn(),
		post: vi.fn()
	}
}));

import { auth } from '../auth.store';
import type { LoginResponse } from '$lib/services/auth.service';

describe('auth store', () => {
	const nowSec = Math.floor(Date.now() / 1000);

	const tokens = {
		accessToken: 'test-access',
		refreshToken: 'test-refresh',
		accessTokenExpiresAt: nowSec + 3600,
		refreshTokenExpiresAt: nowSec + 86400
	};

	const mockResponse: LoginResponse = {
		success: true,
		user_name: 'Test User',
		user_login: 'testuser',
		user_email: 'testuser@example.com',
		user_is_service_account: false,
		id: 1,
		uuid: 'uuid-1',
		active: true,
		external_id: null,
		in_dark_mode: false,
		has_mini_sidebar: false,
		has_deletion_confirmation: false,
		mfa_setup_complete: true,
		tokens: {
			access_token: tokens.accessToken,
			refresh_token: tokens.refreshToken,
			access_token_expires_at: tokens.accessTokenExpiresAt,
			refresh_token_expires_at: tokens.refreshTokenExpiresAt
		}
	};

	beforeEach(() => {
		localStorage.clear();
		vi.clearAllMocks();
	});

	it('should set auth state', async () => {
		auth.setAuth(mockResponse, tokens);

		await new Promise<void>((resolve) => {
			let unsub: (() => void) | undefined;

			unsub = auth.subscribe((state) => {
				if (state.isAuthenticated) {
					expect(state.user).toEqual(mockResponse);
					expect(state.isAuthenticated).toBe(true);
					expect(state.tokens).toEqual(tokens);

					if (unsub) unsub();
					resolve();
				}
			});
		});

		expect(localStorage.getItem('iris_access_token')).toBe(tokens.accessToken);
		expect(localStorage.getItem('iris_refresh_token')).toBe(tokens.refreshToken);
		expect(localStorage.getItem('iris_token_expiry')).toBe(String(tokens.accessTokenExpiresAt));
		expect(localStorage.getItem('iris_refresh_expiry')).toBe(String(tokens.refreshTokenExpiresAt));
	});

	it('should clear auth state', async () => {
		auth.setAuth(mockResponse, tokens);
		auth.clearAuth();

		await new Promise<void>((resolve) => {
			let unsub: (() => void) | undefined;

			unsub = auth.subscribe((state) => {
				if (!state.isAuthenticated) {
					expect(state.user).toBeNull();
					expect(state.isAuthenticated).toBe(false);
					expect(state.tokens).toBeNull();

					if (unsub) unsub();
					resolve();
				}
			});
		});

		expect(localStorage.getItem('iris_access_token')).toBeNull();
		expect(localStorage.getItem('iris_refresh_token')).toBeNull();
		expect(localStorage.getItem('iris_token_expiry')).toBeNull();
		expect(localStorage.getItem('iris_refresh_expiry')).toBeNull();
	});
});

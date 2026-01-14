import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthService, type LoginResponse } from '../auth.service';
import { ApiService } from '../api.service';
import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.store';

vi.mock('../api.service');

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('$env/dynamic/public', () => ({
	env: {
		PUBLIC_EXTERNAL_API_URL: 'http://localhost:8080',
		PUBLIC_INTERNAL_API_URL: 'http://localhost:8080'
	}
}));

vi.mock('$app/environment', () => ({
	browser: true
}));

vi.mock('$lib/stores/auth.store', () => ({
	auth: {
		setAuth: vi.fn(),
		clearAuth: vi.fn(),
		updateTokens: vi.fn(),
		getRefreshToken: vi.fn()
	}
}));

describe('AuthService', () => {
	const mockCredentials = {
		username: 'testuser',
		password: 'password123'
	};

	const mockLoginData: LoginResponse = {
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
			access_token: 'access-token',
			refresh_token: 'refresh-token',
			access_token_expires_at: 1700000000,
			refresh_token_expires_at: 1700003600
		}
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('should login and set auth', async () => {
		(ApiService.post as unknown as vi.Mock).mockResolvedValueOnce({
			ok: true,
			data: mockLoginData
		});

		const result = await AuthService.login(mockCredentials);

		expect(result).toEqual(mockLoginData);
		expect(ApiService.post).toHaveBeenCalledWith('/auth/login', mockCredentials, {
			skipTokenRefresh: true
		});

		expect(auth.setAuth).toHaveBeenCalledWith(mockLoginData, {
			accessToken: mockLoginData.tokens.access_token,
			refreshToken: mockLoginData.tokens.refresh_token,
			accessTokenExpiresAt: mockLoginData.tokens.access_token_expires_at,
			refreshTokenExpiresAt: mockLoginData.tokens.refresh_token_expires_at
		});

		expect(goto).not.toHaveBeenCalled();
	});

	it('should logout and clear auth', async () => {
		(ApiService.post as unknown as vi.Mock).mockResolvedValueOnce({ ok: true, data: {} });

		await AuthService.logout();

		expect(ApiService.post).toHaveBeenCalledWith('/auth/logout', {});
		expect(auth.clearAuth).toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith('/login');
	});
});

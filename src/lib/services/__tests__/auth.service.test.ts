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
		getRefreshToken: vi.fn(),
		setMfaSetupComplete: vi.fn(),
		setMfaVerified: vi.fn()
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

		// AuthService.setupMfa/verifyMfa uses `{ fetch }` (global fetch)
		// Ensure it exists in the test runtime
		if (!(globalThis as any).fetch) {
			(globalThis as any).fetch = vi.fn();
		}

		(auth.getRefreshToken as unknown as vi.Mock).mockReturnValue('refresh-token');
	});

	it('should login and set auth', async () => {
		(ApiService.post as unknown as vi.Mock).mockResolvedValueOnce({
			ok: true,
			data: mockLoginData
		});

		const result = await AuthService.login(mockCredentials);

		expect(result).toEqual(mockLoginData);
		expect(ApiService.post).toHaveBeenCalledWith('/api/v2/auth/login', mockCredentials, {
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

	it('should throw on login failure', async () => {
		(ApiService.post as unknown as vi.Mock).mockResolvedValueOnce({
			ok: false,
			error: { message: 'Invalid credentials' }
		});

		await expect(AuthService.login(mockCredentials)).rejects.toThrow('Invalid credentials');
		expect(auth.setAuth).not.toHaveBeenCalled();
	});

	it('should logout and clear auth', async () => {
		(ApiService.post as unknown as vi.Mock).mockResolvedValueOnce({ ok: true, data: {} });

		await AuthService.logout();

		expect(ApiService.post).toHaveBeenCalledWith('/api/v2/auth/logout', {});
		expect(auth.clearAuth).toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith('/login');
	});

	it('should still clear auth + redirect even if logout API fails', async () => {
		(ApiService.post as unknown as vi.Mock).mockRejectedValueOnce(new Error('network'));

		await AuthService.logout();

		expect(auth.clearAuth).toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith('/login');
	});

	it('should refresh token and update tokens', async () => {
		(ApiService.post as unknown as vi.Mock).mockResolvedValueOnce({
			ok: true,
			data: {
				tokens: {
					access_token: 'new-access',
					refresh_token: 'new-refresh',
					access_token_expires_at: 1800000000,
					refresh_token_expires_at: 1800003600
				}
			}
		});

		const result = await AuthService.refreshToken();

		expect(ApiService.post).toHaveBeenCalledWith(
			'/api/v2/auth/refresh-token',
			{ refresh_token: 'refresh-token' },
			{ skipAuthRedirect: true, skipTokenRefresh: true }
		);

		expect(auth.updateTokens).toHaveBeenCalledWith({
			accessToken: 'new-access',
			refreshToken: 'new-refresh',
			accessTokenExpiresAt: 1800000000,
			refreshTokenExpiresAt: 1800003600
		});

		expect(result).toEqual({
			tokens: {
				access_token: 'new-access',
				refresh_token: 'new-refresh',
				access_token_expires_at: 1800000000,
				refresh_token_expires_at: 1800003600
			}
		});
	});

	it('should clear auth and throw if refresh token fails', async () => {
		(ApiService.post as unknown as vi.Mock).mockResolvedValueOnce({
			ok: false,
			error: { message: 'Invalid refresh token' }
		});

		await expect(AuthService.refreshToken()).rejects.toThrow('Failed to refresh token');
		expect(auth.clearAuth).toHaveBeenCalled();
	});

	it('should call whoami', async () => {
		(ApiService.get as unknown as vi.Mock).mockResolvedValueOnce({
			ok: true,
			data: {
				responseData: mockLoginData,
				tokenInfo: mockLoginData.tokens
			}
		});

		const result = await AuthService.whoami();

		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/auth/whoami');
		expect(result).toEqual({
			responseData: mockLoginData,
			tokenInfo: mockLoginData.tokens
		});
	});

	it('should setup MFA and update store', async () => {
		(ApiService.post as unknown as vi.Mock).mockResolvedValueOnce({
			ok: true,
			data: { mfa_setup_complete: true }
		});

		await AuthService.setupMfa('admin', '123456', 'BASE32SECRET');

		expect(ApiService.post).toHaveBeenCalledWith(
			'/api/v2/auth/mfa-setup',
			{
				refresh_token: 'refresh-token',
				password: 'admin',
				token: '123456',
				mfa_secret: 'BASE32SECRET'
			},
			{ fetch: (globalThis as any).fetch }
		);

		expect(auth.setMfaSetupComplete).toHaveBeenCalledWith(true);
		expect(auth.setMfaVerified).toHaveBeenCalledWith(false);
	});

	it('should throw on setup MFA failure', async () => {
		(ApiService.post as unknown as vi.Mock).mockResolvedValueOnce({
			ok: false,
			error: { message: 'Invalid token' }
		});

		await expect(AuthService.setupMfa('admin', '123456', 'BASE32SECRET')).rejects.toThrow(
			'Invalid token'
		);

		expect(auth.setMfaSetupComplete).not.toHaveBeenCalled();
	});

	it('should verify MFA and set mfaVerified=true', async () => {
		(ApiService.post as unknown as vi.Mock).mockResolvedValueOnce({
			ok: true,
			data: { mfa_verified: true }
		});

		await AuthService.verifyMfa(' 123 456 ');

		expect(ApiService.post).toHaveBeenCalledWith(
			'/api/v2/auth/mfa-verify',
			{
				refresh_token: 'refresh-token',
				token: '123456'
			},
			{ fetch: (globalThis as any).fetch }
		);

		expect(auth.setMfaVerified).toHaveBeenCalledWith(true);
	});

	it('should throw on verify MFA failure', async () => {
		(ApiService.post as unknown as vi.Mock).mockResolvedValueOnce({
			ok: false,
			error: { message: 'MFA verification failed' }
		});

		await expect(AuthService.verifyMfa('123456')).rejects.toThrow('MFA verification failed');
		expect(auth.setMfaVerified).not.toHaveBeenCalledWith(true);
	});

	it('setMfaVerified should proxy to auth store', () => {
		AuthService.setMfaVerified(true);
		expect(auth.setMfaVerified).toHaveBeenCalledWith(true);
	});
});

import { describe, it, expect, vi } from 'vitest';
import { get } from 'svelte/store';

// Simulate the SSR server: one module instance shared by every request.
vi.mock('$app/environment', () => ({ browser: false }));
vi.mock('@sveltejs/kit', () => ({ redirect: vi.fn() }));
vi.mock('$lib/services/api.service', () => ({
	ApiService: {
		get: vi.fn(),
		post: vi.fn()
	}
}));

import { auth, username, current_user } from '../auth.store';
import type { LoginResponse } from '$lib/services/auth.service';

describe('auth store on the server', () => {
	const nowSec = Math.floor(Date.now() / 1000);

	const tokens = {
		accessToken: 'server-access',
		refreshToken: 'server-refresh',
		accessTokenExpiresAt: nowSec + 3600,
		refreshTokenExpiresAt: nowSec + 86400
	};

	const otherUser = {
		user_name: 'Someone Else',
		user_login: 'someone',
		mfa_setup_complete: true
	} as LoginResponse;

	it('does not retain a user set by a server-side login', () => {
		// The login form action runs AuthService.login on the server, which
		// calls setAuth. That must not leak into other users' SSR renders.
		auth.setAuth(otherUser, tokens, true);

		expect(get(current_user)).toBeNull();
		expect(get(username)).toBe('Loading...');
		expect(auth.getAccessToken()).toBeNull();
		expect(auth.getRefreshToken()).toBeNull();
		expect(auth.getMfaEnabled()).toBe(false);
	});

	it('does not retain tokens from a server-side refresh', () => {
		auth.updateTokens(tokens);
		auth.setMfaVerified(true);

		expect(auth.getAccessToken()).toBeNull();
		expect(auth.getMfaVerified()).toBe(false);
	});
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { auth } from '../auth.store';
import type { LoginResponse } from '$lib/services/auth.service';

describe('auth store', () => {
    const mockResponse: LoginResponse = {
        token: 'test-token',
        user: {
            id: '1',
            uuid: 'uuid-1',
            user_name: 'Test User',
            user_login: 'testuser',
            user_email: 'testuser@example.com',
            in_dark_mode: false,
            has_mini_sidebar: false,
            has_deletion_confirmation: false,
        },
    };

    beforeEach(() => {
        localStorage.clear();
        vi.clearAllMocks();
    });

    it('should set auth state', async () => {
        auth.setAuth(mockResponse);

        await new Promise((resolve) => {
            auth.subscribe((state) => {
                if (state.isAuthenticated) {
                    expect(state.user).toEqual(mockResponse);
                    expect(state.isAuthenticated).toBe(true);
                    resolve(true);
                }
            });
        });

        const savedAuth = localStorage.getItem('auth');
        expect(savedAuth).toBe(JSON.stringify({
            user: mockResponse,
            isAuthenticated: true,
        }));
    });

    it('should clear auth state', async () => {
        auth.setAuth(mockResponse);
        auth.clearAuth();

        await new Promise((resolve) => {
            auth.subscribe((state) => {
                if (!state.isAuthenticated) {
                    expect(state.user).toBeNull();
                    expect(state.isAuthenticated).toBe(false);
                    resolve(true);
                }
            });
        });

        const savedAuth = localStorage.getItem('auth');
        expect(savedAuth).toBeNull();
    });
});
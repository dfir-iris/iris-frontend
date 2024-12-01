import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthService, LoginCredentials, LoginResponse } from '../auth.service';
import { ApiService } from '../api.service';
import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.store';

vi.mock('../api.service');
vi.mock('$app/navigation', () => ({
    goto: vi.fn(),
}));
vi.mock('$lib/stores/auth.store', () => ({
    auth: {
        setAuth: vi.fn(),
        clearAuth: vi.fn(),
    },
}));

describe('AuthService', () => {
    const mockCredentials: LoginCredentials = {
        username: 'testuser',
        password: 'password123',
    };

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
        vi.clearAllMocks();
    });

    it('should login and set auth', async () => {
        (ApiService.post as vi.Mock).mockResolvedValueOnce(mockResponse);

        const result = await AuthService.login(mockCredentials);

        expect(result).toEqual(mockResponse);
        expect(ApiService.post).toHaveBeenCalledWith('/auth/login', mockCredentials);
        expect(auth.setAuth).toHaveBeenCalledWith(mockResponse);
        expect(goto).toHaveBeenCalledWith('/dashboard');
    });

    it('should redirect to specified URL after login', async () => {
        (ApiService.post as vi.Mock).mockResolvedValueOnce(mockResponse);

        // Mock window.location.search
        const originalLocation = window.location;
        delete (window as any).location;
        (window as any).location = {
            search: '?redirect=/custom-url',
        };

        const result = await AuthService.login(mockCredentials);

        expect(result).toEqual(mockResponse);
        expect(ApiService.post).toHaveBeenCalledWith('/auth/login', mockCredentials);
        expect(auth.setAuth).toHaveBeenCalledWith(mockResponse);
        expect(goto).toHaveBeenCalledWith('/custom-url');

        // Restore original location
        window.location = originalLocation;
    });

    it('should logout and clear auth', async () => {
        await AuthService.logout();

        expect(auth.clearAuth).toHaveBeenCalled();
        expect(goto).toHaveBeenCalledWith('/login');
    });
});
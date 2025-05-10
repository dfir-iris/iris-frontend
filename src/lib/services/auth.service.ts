import { browser } from '$app/environment';
import { goto } from '$app/navigation';
import { API_BASE_URL } from '$lib/config/api.config';
import { auth, authUserStore } from '$lib/stores/auth.store';
import { ApiService } from './api.service';

interface LoginCredentials {
    username: string;
    password: string;
}

export interface LoginResponse {
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
    tokens: {
        access_token: string;
        refresh_token: string;
        access_token_expires_at: number;
        refresh_token_expires_at: number;
    };
}

class AuthenticationService {
    async login(credentials: LoginCredentials): Promise<LoginResponse> {
        try {
            const response = await fetch('/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(credentials)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Authentication failed');
            }
            
            const responseData = await response.json() as LoginResponse;
            
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
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }
    
    async logout() {
        try {
            await ApiService.post('/auth/logout', {});
        } catch (error) {
            console.error('Logout error:', error);
        } finally {
            // Clear user data from store
            authUserStore.set(null);
            
            // Redirect to login
            if (browser) {
                goto('/login');
            }
        }
    }
    
    async refreshToken() {
        try {
            console.log('Refreshing token...');
            const response = await ApiService.post('/auth/refresh-token', {
                refresh_token: auth.getRefreshToken()
            }, {
                skipAuthRedirect: true,
                skipTokenRefresh: true
            });
            
            if (!response.ok) {
                console.error('Token refresh failed:', response.statusText);
                throw new Error('Failed to refresh token');
            }
            
            const refreshData = response.data;
            
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
        } catch (error) {
            console.error('Token refresh error:', error);
            // If refresh fails, redirect to login
            auth.clearAuth();
            // this.logout();
            throw error;
        }
    }
}

export const AuthService = new AuthenticationService();


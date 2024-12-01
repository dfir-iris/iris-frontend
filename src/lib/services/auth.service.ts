// src/lib/services/auth.service.ts
import { ApiService } from './api.service';
import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.store';
import { ENDPOINTS } from '$lib/constants/endpoints';
import { get } from 'svelte/store';


export interface LoginCredentials {
    username: string;
    password: string;
}

export interface LoginResponse {
    token: string;
    user: {
        id: string;
        uuid: string;
        user_name: string;
        user_login: string;
        user_email: string;
        in_dark_mode: boolean;
        has_mini_sidebar: boolean;
        has_deletion_confirmation: boolean;
    };
}

export class AuthService {
    static async login(credentials: LoginCredentials): Promise<LoginResponse> {
        const response = await ApiService.post<LoginResponse>(ENDPOINTS.auth.login, credentials);
        auth.setAuth(response);
        
        // Handle redirect after login
        const params = new URLSearchParams(window.location.search);
        const redirect = params.get('redirect') || '/dashboard';
        goto(redirect);
        
        return response;
    }

    static async logout(): Promise<void> {
        try {
            await ApiService.post('/auth/logout', {});
        } finally {
            auth.clearAuth();
            goto('/login');
        }
    }

    static checkAuth(): boolean {
        return get(auth).isAuthenticated;
    }
}
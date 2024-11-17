// src/lib/services/api.service.ts
import { auth } from '$lib/stores/auth.store';
import { goto } from '$app/navigation';
import { get } from 'svelte/store';

export class ApiService {
    private static baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

    static async request<T>(endpoint: string, options: RequestInit): Promise<T> {
        const url = `${this.baseUrl}/api/v2${endpoint}`;
        
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Include-Credentials': 'true',
            ...options.headers,
        };

        const response = await fetch(url, {
            ...options,
            credentials: 'include', // This will send cookies automatically
            headers,
            mode: 'cors',
        });

        if (response.status === 401) {
            auth.clearAuth();
            const redirect = new URLSearchParams(window.location.search).get('redirect') || '/dashboard';
            goto(`/login?redirect=${encodeURIComponent(redirect)}`);
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.json();
    }

    static async get<T>(endpoint: string): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'GET',
        });
    }

    static async post<T>(endpoint: string, data: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    static async put<T>(endpoint: string, data: any): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
        });
    }

    static async delete<T>(endpoint: string): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'DELETE',
        });
    }
}
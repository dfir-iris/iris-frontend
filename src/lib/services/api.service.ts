// src/lib/services/api.service.ts
import { authTokenStore } from '$lib/stores/auth.store';
import { get } from 'svelte/store';

interface RequestOptions {
    method: string,
    body?: string,
    options: MethodOptions
}

interface MethodOptions {
    sessionCookie?: string
}

export class ApiService {
    private static baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

    static async request<T>(endpoint: string, options: RequestOptions = { method: 'GET', options: {} },): Promise<T> {
        const url = `${this.baseUrl}/api/v2${endpoint}`;
        const sessionCookie = get(authTokenStore) || options.options.sessionCookie

        // Default headers
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cookie': "session=" + sessionCookie || ''
        };

        const response = await fetch(url, {
            ...options,
            credentials: 'include', // Send cookies automatically (optional depending on the environment)
            headers,
            mode: 'cors',
        });

        if (response.status === 401) {
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        return response.json();
    }

    static async get<T>(endpoint: string, options: MethodOptions = {}): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'GET',
            options
        });
    }

    static async post<T>(endpoint: string, data: object, options: MethodOptions = {}): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
            options
        });
    }

    static async put<T>(endpoint: string, data: object, options: MethodOptions = {}): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
            options
        });
    }

    static async delete<T>(endpoint: string, options: MethodOptions = {}): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'DELETE',
            options
        });
    }
}

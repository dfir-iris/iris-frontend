// src/lib/services/api.service.ts

import { authTokenStore } from "$lib/stores/auth.store";
import { get } from "svelte/store";

export class ApiService {
    private static baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

    static async request<T>(endpoint: string, options: RequestInit): Promise<T> {
        const url = `${this.baseUrl}/api/v2${endpoint}`;

        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Include-Credentials': 'true',
            'Authorization': `Bearer ${get(authTokenStore)}`
        };

        const response = await fetch(url, {
            ...options,
            credentials: 'include', // This will send cookies automatically
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

    static async get<T>(endpoint: string): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'GET',
        });
    }

    static async post<T>(endpoint: string, data: object): Promise<T> {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
        });
    }

    static async put<T>(endpoint: string, data: object): Promise<T> {
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
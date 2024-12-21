import { error } from "@sveltejs/kit";

interface RequestOptions {
    method: string,
    body?: string,
    options: MethodOptions
}

interface MethodOptions {
    sessionCookie?: string
}

export interface RequestResponse<T> {
    headers: object
    data: T
}

export class ApiService {
    private static baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8080';

    static async request<T>(endpoint: string, options: RequestOptions = { method: 'GET', options: {} }, fetch_fn: typeof fetch): Promise<RequestResponse<T>> {
        const url = `${this.baseUrl}/api/v2${endpoint}`;
        const sessionCookie = options.options.sessionCookie;

        // Default headers
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Access-Control-Allow-Origin': '*'
        };

        // If session cookie, add it (server side request)
        if (sessionCookie) {
            headers['Cookie'] = `session=${sessionCookie}`;
        }

        const fetch_call = fetch_fn || fetch;

        const response = await fetch_call(url, {
            ...options,
            credentials: 'include', // Send cookies automatically (optional depending on the environment)
            headers,
            mode: 'cors',
        });

        if (response.status === 401) {
            error(401, 'Unauthorized');
        }

        if (!response.ok) {
            error(400, `API call failed: ${response.status} -- ${response.text}`);
        }

        const responseData = await response.json();
        return {
            headers: response.headers,
            data: responseData
        };
    }

    static async get<T>(endpoint: string, options: MethodOptions = {}, fetch_fn: typeof fetch) {
        return this.request<T>(endpoint, {
            method: 'GET',
            options
        }, fetch_fn);
    }

    static async post<T>(endpoint: string, data: object, options: MethodOptions = {}, fetch_fn: typeof fetch) {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
            options
        }, fetch_fn);
    }

    static async put<T>(endpoint: string, data: object, options: MethodOptions = {}, fetch_fn: typeof fetch) {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
            options
        }, fetch_fn);
    }

    static async delete<T>(endpoint: string, options: MethodOptions = {}, fetch_fn: typeof fetch) {
        return this.request<T>(endpoint, {
            method: 'DELETE',
            options
        }, fetch_fn);
    }
}
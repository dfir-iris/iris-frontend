import { error } from "@sveltejs/kit";
import { env } from '$env/dynamic/public'
import { PUBLIC_USE_MOCK_API_DATA } from '$env/static/public';
import { browser } from "$app/environment";
import { randomDelay } from "$lib/utils/mock";

interface RequestOptions {
    method: string,
    body?: string,
    options: MethodOptions
}

interface MethodOptions {
    sessionCookie?: string
}

export interface RequestResponse<T> {
    headers: Headers
    data: T,
    url: string
}

export interface Paginated<T> {
    total: number,
    results: T[],
    last_page: number | null,
    current_page: number,
    next_page: number | null
}

export class ApiService {
    private static baseUrl = browser ? env.PUBLIC_EXTERNAL_API_URL : env.PUBLIC_INTERNAL_API_URL;

    static async request<T>(endpoint: string, options: RequestOptions = { method: 'GET', options: {} }, fetch_fn: typeof fetch = fetch): Promise<RequestResponse<T>> {
        const url = `${this.baseUrl}/api/v2${endpoint}`;
        const sessionCookie = options.options.sessionCookie;

        // Handle if mock data in use
        if (PUBLIC_USE_MOCK_API_DATA == "true") {
            return this.mockRequest(endpoint)
        }

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

        // Use fetch method to call endpoint
        const fetch_call = fetch_fn || fetch;
        let response: Response | null = null;

        try {
            response = await fetch_call(url, {
                ...options,
                credentials: 'include', // Send cookies automatically (optional depending on the environment)
                headers,
                mode: 'cors',
            });
        } catch (err) {
            console.error(`Fetching session failed: ${err}`)
            error(500, 'Fetching session failed: ${err}')
        }


        // Handle if API replies with unauthorized
        if (response.status === 401) {
            error(401, 'Unauthorized');
        }

        // If endpoint is 404, fallback to mocked request
        if (response.status === 404) {
            return this.mockRequest(endpoint)
        }

        // Other error handling
        if (!response.ok) {
            const text = await response.text()
            error(400, `API call failed: ${response.status} -- ${text}`);
        }

        // Parse JSON and return it with other request meta to caller
        const responseData = await response.json();
        return {
            headers: response.headers,
            data: responseData,
            url
        };
    }

    static async mockRequest<T>(endpoint: string): Promise<RequestResponse<T>> {
        try {
            endpoint = endpoint.replaceAll('/', '_')
            endpoint = endpoint.split('?', 1)[0]
            console.info(`Mocking ${endpoint}...`)
            setTimeout(() => {

            })
            const module = await import(`./mocks/${endpoint}.json`);
            await randomDelay()
            return {
                headers: new Headers(),
                data: module.default as T,
                url: `mock${endpoint}`
            };
        } catch (e) {
            console.error(e)
            error(404, `Mock data not found for endpoint: ${endpoint}`);
        }
    }

    static async get<T>(endpoint: string, options: MethodOptions = {}, fetch_fn?: typeof fetch) {
        return this.request<T>(endpoint, {
            method: 'GET',
            options
        }, fetch_fn);
    }

    static async post<T>(endpoint: string, data: object, options: MethodOptions = {}, fetch_fn?: typeof fetch) {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
            options
        }, fetch_fn);
    }

    static async put<T>(endpoint: string, data: object, options: MethodOptions = {}, fetch_fn?: typeof fetch) {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
            options
        }, fetch_fn);
    }

    static async delete<T>(endpoint: string, options: MethodOptions = {}, fetch_fn?: typeof fetch) {
        return this.request<T>(endpoint, {
            method: 'DELETE',
            options
        }, fetch_fn);
    }
}
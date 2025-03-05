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
    sessionCookie?: string,
    fetch?: typeof fetch
}

export interface RequestResponse<T> {
    headers: Headers,
    status: number,
    data: T,
    url: string
}

export interface Paginated<T> {
    total: number,
    data: T[],
    last_page: number | null,
    current_page: number,
    next_page: number | null
}

export class ApiService {
    private static baseUrl = browser ? env.PUBLIC_EXTERNAL_API_URL : env.PUBLIC_INTERNAL_API_URL;

    static async request<T>(endpoint: string, options: RequestOptions = { method: 'GET', options: {} }, fetch_fn: typeof fetch = fetch): Promise<RequestResponse<T>> {
        const url = `/api/v2${endpoint}`;

        // Handle if mock data in use
        if (PUBLIC_USE_MOCK_API_DATA == "true") {
            let getMocked;
            try {
                getMocked = await this.mockRequest<T>(endpoint)
            } catch {
                return error(404, `Mock data not found for endpoint: ${endpoint}`);
            }

            if (getMocked === undefined) {
                return error(404, `Mock data not found for endpoint: ${endpoint}`);
            }

            return getMocked;
        }

        // Default headers
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        // Debug
        // console.log('------------------')
        // console.log('Browser:', browser)
        // console.log('Fetching:', endpoint)
        // console.log('URL:', url);
        // console.log('Options:', options);
        // console.log('Headers:', headers);
        
        let fetch_call = fetch;
        if (fetch_fn) {
            fetch_call = fetch_fn;
        } 

        let response: Response | null = null;

        try {
            response = await fetch_call(url, {
                ...options,
                credentials: 'include', // Send cookies automatically (optional depending on the environment)
                headers,
                mode: 'cors',
            });
        } catch (err) {
            console.error(`Fetching ${endpoint} failed: ${err}`)
            error(500, `Fetching ${endpoint} failed: ${err}`)
        }

        // Handle if API replies with unauthorized
        if (response.status === 401) {
            console.error(`Unauthorized: ${endpoint}`)
            error(401, 'Unauthorized');
        }

        // If endpoint is 404, fallback to mocked request
        if (response.status === 404) {
            console.error(`Endpoint not found: ${endpoint} - mocking...`)
            return this.mockRequest<T>(endpoint)
        }

        // Other error handling
        if (!response.ok) {
            const text = await response.text()
            console.error(`API call failed: ${response.status} -- ${text}`)
            error(400, `API call failed: ${response.status} -- ${text}`);
        }

        // Parse JSON and return it with other request meta to caller
        try {
            const responseData = await response.json();
            return {
                headers: response.headers,
                data: responseData,
                status: response.status,
                url
            };

        } catch (err) {
            console.error(`Failed to parse JSON: ${err}`)
            error(400, `Failed to parse JSON: ${err}`);
        }
    }

    static async mockRequest<T>(endpoint: string): Promise<RequestResponse<T> | undefined> {
        try {
            endpoint = endpoint.replaceAll('/', '_')
            endpoint = endpoint.split('?', 1)[0]
            console.info(`Mocking ${endpoint}...`)
            const module = await import(`./mocks/${endpoint}.json`);
            await randomDelay()  // simulates loading latency
            return {
                headers: new Headers(),
                data: module.default as T,
                status: 200,
                url: `mock${endpoint}`
            };
        } catch (e) {
            console.error(e)
            return
        }
    }

    static async get<T>(endpoint: string, options: MethodOptions = {}) {
        return this.request<T>(endpoint, {
            method: 'GET',
            options
        }, options?.fetch);
    }

    static async post<T>(endpoint: string, data: object, options: MethodOptions = {}) {
        return this.request<T>(endpoint, {
            method: 'POST',
            body: JSON.stringify(data),
            options
        }, options?.fetch);
    }

    static async put<T>(endpoint: string, data: object, options: MethodOptions = {}) {
        return this.request<T>(endpoint, {
            method: 'PUT',
            body: JSON.stringify(data),
            options
        }, options?.fetch);
    }

    static async delete<T>(endpoint: string, options: MethodOptions = {}) {
        return this.request<T>(endpoint, {
            method: 'DELETE',
            options
        }, options?.fetch);
    }
}
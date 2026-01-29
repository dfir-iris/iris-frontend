import { env } from '$env/dynamic/public';
import { browser } from '$app/environment';
import { randomDelay } from '$lib/utils/mock';
import { auth } from '$lib/stores/auth.store';
import { AuthService } from './auth.service';
import { API_BASE_URL } from '$lib/config/api.config';
import { ApiLogger } from '$lib/utils/api-logger';

export type ResponseData<T> = T | string | null;

export interface ResponseError {
	message: string;
	type: string;
	status: number;
}

export interface RequestResponse<T> {
	headers?: Headers;
	status: number;
	data: ResponseData<T>;
	error?: ResponseError;
	ok?: boolean;
}

export interface MockRequestResponse<T> extends RequestResponse<T> {
	url: string;
}

export interface Paginated<T> {
	total: number;
	data: T[];
	last_page: number | null;
	current_page: number;
	next_page: number | null;
}

export interface ApiOptions {
	headers?: Record<string, string>;
	skipAuthRedirect?: boolean;
	skipTokenRefresh?: boolean;
	fetch?: typeof fetch;
	absoluteUrl?: boolean;
	useApiPrefix?: boolean; // Whether to use the API prefix (default: true)
}

// Required option in newer Node.js versions when sending a body
export interface RequestInitDuplex extends RequestInit {
	duplex?: string;
}

export type QueryArrayFormat = 'repeat' | 'comma';

export interface QueryStringOptions {
	arrayFormat?: QueryArrayFormat;
	encode?: boolean;
	sortKeys?: boolean;
	allowNested?: boolean;
}

export class ApiService {
	static baseUrl = env.PUBLIC_EXTERNAL_API_URL;

	static async get<T>(url: string, options: ApiOptions = {}): Promise<RequestResponse<T>> {
		return ApiService.request<T>('GET', url, undefined, options);
	}

	static async post<TRes, TBody = unknown>(
		url: string,
		data?: TBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<TRes>> {
		return ApiService.request<TRes>('POST', url, data, options);
	}

	static async put<TRes, TBody = unknown>(
		url: string,
		data: TBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<TRes>> {
		return ApiService.request<TRes>('PUT', url, data, options);
	}

	static async delete<T>(url: string, options: ApiOptions = {}): Promise<RequestResponse<T>> {
		return ApiService.request<T>('DELETE', url, undefined, options);
	}

	static async patch<TRes, TBody = unknown>(
		url: string,
		data: TBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<TRes>> {
		return ApiService.request<TRes>('PATCH', url, data, options);
	}

	static withQuery(path: string, params?: Record<string, unknown>): string {
		return `${path}${ApiService.toQueryString(params)}`;
	}

	private static toQueryString(params?: Record<string, unknown>): string {
		if (!params) return '';

		const urlParams = new URLSearchParams();

		for (const [k, v] of Object.entries(params)) {
			if (v == null) continue;

			if (Array.isArray(v)) {
				for (const item of v) if (item != null) urlParams.append(k, String(item));
			} else {
				urlParams.set(k, v instanceof Date ? v.toISOString() : String(v));
			}
		}

		const queryString = urlParams.toString();
		return queryString ? `?${queryString}` : '';
	}

	private static async request<T>(
		method: string,
		url: string,
		data?: unknown,
		{
			headers = {},
			skipAuthRedirect = false,
			skipTokenRefresh = false,
			fetch: customFetch = browser ? window.fetch : global.fetch,
			absoluteUrl = false,
			useApiPrefix = true
		}: ApiOptions = {}
	): Promise<RequestResponse<T>> {
		const startTime = Date.now();
		try {
			// Use the full URL or build it with our base URL
			const fullUrl = absoluteUrl ? url : ApiService.buildApiUrl(url, useApiPrefix);

			console.log(`Making ${method} request to: ${fullUrl}`);

			// Create headers object properly to ensure it's iterable
			const fetchHeaders = new Headers({
				'Content-Type': 'application/json',
				Accept: 'application/json',
				...headers
			});

			const fetchOptions: RequestInitDuplex = {
				method,
				headers: fetchHeaders
			};

			// Add authentication token if available
			if (!headers['Authorization'] && !skipTokenRefresh) {
				console.log(auth.isTokenExpired(), auth.isRefreshTokenExpired());
				// Check if token refresh is needed
				if (auth.isTokenExpired() && !auth.isRefreshTokenExpired()) {
					await AuthService.refreshToken();
					console.log(`Token refreshed successfully.`);
				}

				const accessToken = auth.getAccessToken();
				if (accessToken) {
					fetchHeaders.set('Authorization', `Bearer ${accessToken}`);
				}
			}

			// Add body if we have data
			if (data) {
				fetchOptions.body = JSON.stringify(data);

				// Required option in newer Node.js versions when sending a body
				fetchOptions.duplex = 'half';
			}

			// Log the request
			ApiLogger.logRequest(
				method,
				fullUrl.toString(),
				Object.fromEntries([...fetchHeaders.entries()]),
				data
			);

			try {
				// Make the request with the full URL
				const response = await customFetch(fullUrl, fetchOptions);

				// Get response headers as object
				const responseHeaders = Object.fromEntries([...response.headers.entries()]);

				// Clone the response to read the body without consuming it
				const clonedResponse = response.clone();
				let responseBody;

				try {
					// Only attempt to parse JSON responses
					if (response.headers.get('content-type')?.includes('application/json')) {
						responseBody = await clonedResponse.json();
					}
				} catch {
					responseBody = '[unparseable response]';
				}

				// Log the response
				ApiLogger.logResponse(
					method,
					fullUrl.toString(),
					response.status,
					responseHeaders,
					responseBody,
					Date.now() - startTime
				);

				// Check for unauthorized access (401)
				if (response.status === 401 && !skipAuthRedirect && !skipTokenRefresh) {
					// Try to refresh the token
					const refreshSuccessful = await AuthService.refreshToken();

					if (refreshSuccessful) {
						// Retry the original request with the new token
						return ApiService.request(method, url, data, {
							headers,
							skipAuthRedirect,
							skipTokenRefresh: true,
							fetch: customFetch,
							absoluteUrl,
							useApiPrefix
						});
					} else {
						// If refresh failed, trigger session expiration
						if (browser) {
							window.dispatchEvent(new CustomEvent('session-expired'));
						}
						throw new Error('Unauthorized: Session expired');
					}
				}

				// Parse the response
				let responseData;
				const contentType = response.headers.get('Content-Type');

				if (contentType && contentType.includes('application/json')) {
					responseData = await response.json();
				} else {
					responseData = await response.text();
				}

				// Return the response data, status, and headers
				return {
					data: responseData,
					status: response.status,
					headers: response.headers,
					ok: response.ok
				};
			} catch (error: unknown) {
				// Log the error
				ApiLogger.logResponse(
					method,
					fullUrl.toString(),
					0,
					{},
					{ error: (error as Error).message },
					Date.now() - startTime
				);

				// Handle the error gracefully without crashing
				console.error(`API fetch error: ${(error as Error).message}`);

				// For CORS errors, provide a more specific log to help debugging
				if ((error as Error).message.includes('CORS')) {
					console.warn('CORS issue detected. Please check backend CORS configuration.');
				}

				// Return a default response instead of throwing to prevent crash
				return {
					data: null,
					error: {
						message: (error as Error).message || 'Network request failed',
						type: 'network_error',
						status: 0
					},
					status: 0,
					ok: false
				};
			}
		} catch (error: unknown) {
			// Handle any other errors that may occur outside the fetch call
			console.error(`API processing error: ${(error as Error).message}`);

			// Return a default response instead of throwing
			return {
				data: null,
				error: {
					message: (error as Error).message || 'Request processing failed',
					type: 'processing_error',
					status: 0
				},
				status: 0,
				ok: false
			};
		}
	}

	/**
	 * Helper method to build API URLs consistently
	 */
	private static buildApiUrl(path: string, useApiPrefix = true): string {
		// Ensure path starts with a slash
		let normalizedPath = path.startsWith('/') ? path : `/${path}`;

		// Remove trailing slash from base URL if it exists
		// If we are server side, we need to use the API_BASE_URL, otherwise use our base URL
		let baseUrl = '';
		if (!browser) {
			baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
		} else {
			baseUrl = ApiService.baseUrl.endsWith('/')
				? ApiService.baseUrl.slice(0, -1)
				: ApiService.baseUrl;
		}

		// Check if the path is already an API or auth path
		const isApiPath =
			normalizedPath.startsWith('/api/') ||
			normalizedPath.startsWith('/api/v2/') ||
			normalizedPath.startsWith('/auth/');

		// Add API prefix if needed and not already present
		if (useApiPrefix && !isApiPath) {
			// Default to /api/v2 for compatibility with the backend
			normalizedPath = `/api/v2${normalizedPath}`;
		}

		return `${baseUrl}${normalizedPath}`;
	}

	static async mockRequest<T>(endpoint: string): Promise<MockRequestResponse<T> | undefined> {
		try {
			endpoint = endpoint.replaceAll('/', '_');
			endpoint = endpoint.split('?', 1)[0];
			console.info(`Mocking ${endpoint}...`);
			const module = await import(`./mocks/${endpoint}.json`);
			await randomDelay(); // simulates loading latency
			return {
				headers: new Headers(),
				data: module.default as T,
				status: 200,
				url: `mock${endpoint}`
			};
		} catch (e) {
			console.error('Mock request failed:', e);
			return undefined;
		}
	}
}

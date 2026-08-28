import { browser } from '$app/environment';
import { auth } from '$lib/stores/auth.store';
import { AuthService } from './auth.service';
import { apiOrigin } from '$lib/config/api.config';
import { ApiLogger } from '$lib/utils/api-logger';
import { setLastRequestId } from '$lib/observability/request-id-store';
import { toast } from '$lib/stores/toast.store';

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
	/**
	 * Browser-side origin for API calls. A getter, not a captured
	 * constant: it resolves to the origin the page is on, and the same
	 * bundle is served to every hostname a deployment answers under.
	 * See `apiOrigin` in `$lib/config/api.config`.
	 */
	static get baseUrl(): string {
		return apiOrigin();
	}

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

	static async delete<T, TBody = undefined>(
		url: string,
		options: ApiOptions = {},
		// Optional request body. DELETE-with-body is unusual but
		// occasionally needed (v2 bulk-revoke endpoints do this). The
		// underlying `fetch` happily forwards the body when present;
		// callers that don't need it can keep the old two-arg form.
		body?: TBody
	): Promise<RequestResponse<T>> {
		return ApiService.request<T>('DELETE', url, body, options);
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
				// Pre-flight refresh: if the access token is (nearly)
				// expired but the refresh token is still valid, refresh
				// before firing the request. `AuthService.refreshToken`
				// dedups concurrent callers, so the N-parallel-requests
				// case on a browser reload results in exactly one
				// /refresh-token POST and every request reads the freshly
				// stored access token below.
				if (auth.isTokenExpired() && !auth.isRefreshTokenExpired()) {
					await AuthService.refreshToken();
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

				// Track the server-issued request id so error reports
				// and manual bug submissions can be paired with the
				// server's crash event / log line.
				setLastRequestId(response.headers.get('X-Request-Id'));

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

				// Forbidden (403) — surfaced for mutating verbs only so the
				// user gets a coherent "you can't do that" message instead
				// of the section's generic "Update failed" toast. Read-only
				// views are gated at the UI layer via case-access, but if
				// one slips through (race condition, server policy change,
				// stale cached UI) this is the safety net. GETs are left
				// alone — a 403 on a background read should fail silently
				// rather than spamming toasts.
				if (
					response.status === 403 &&
					browser &&
					['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())
				) {
					toast({
						title: "You don't have permission to do that",
						description: 'Your access level on this case does not allow this action.',
						variant: 'destructive'
					});
				}

				// Check for unauthorized access (401)
				if (response.status === 401 && !skipAuthRedirect && !skipTokenRefresh) {
					// Try to refresh the token. `refreshToken()` returns
					// the response object on success and `null` on any
					// failure (network hiccup, expired refresh, backend
					// blip) — it no longer throws / logs the user out on
					// its own. The 401 retry path here is the single
					// place that decides "session is really dead" and
					// fires `session-expired`.
					const refresh = await AuthService.refreshToken();

					if (refresh?.tokens) {
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

				let responseData;
				if (method.toLowerCase() == 'delete') {
					responseData = '';
				} else {
					// Parse the response
					const contentType = response.headers.get('Content-Type');

					if (contentType && contentType.includes('application/json')) {
						responseData = await response.json();
					} else {
						responseData = await response.text();
					}
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

		// Server side this is the internal backend address; in the browser
		// it is the origin the page is on, so a deployment answering on
		// several hostnames keeps every request same-origin.
		const baseUrl = apiOrigin();

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
}

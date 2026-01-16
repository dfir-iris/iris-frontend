// src/hooks.server.ts
import type { Handle, HandleFetch } from '@sveltejs/kit';

import { API_BASE_URL } from '$lib/config/api.config';
import { createForwardingRequest } from '$lib/utils/request-forwarding';
import { DEV } from 'esm-env';
import { env } from '$env/dynamic/public';

// Define our backend API URL
const AUTH_EXCLUDED_URLS = ['/[fallback]', '/login', '/oidc-login', '/oidc-authorize'];

/**
 * Process headers to ensure they're valid for proxying
 * This function removes problematic headers that could cause issues
 */
function sanitizeHeaders(headers: Headers): Record<string, string> {
	const result: Record<string, string> = {};

	// Copy headers but skip problematic ones
	headers.forEach((value, key) => {
		// Skip headers that cause issues with Node's fetch
		if (
			key.toLowerCase() !== 'connection' &&
			key.toLowerCase() !== 'content-length' &&
			key.toLowerCase() !== 'host' &&
			!key.toLowerCase().startsWith('sec-')
		) {
			result[key] = value;
		}
	});

	return result;
}

/**
 * Copy Set-Cookie safely (supports multiple cookies)
 */
function copySetCookie(from: Headers, to: Headers) {
	const any = from as unknown as { getSetCookie?: () => string[] };

	if (typeof any.getSetCookie === 'function') {
		for (const c of any.getSetCookie()) to.append('set-cookie', c);
		return;
	}

	const sc = from.get('set-cookie');
	if (sc) to.append('set-cookie', sc);
}

/**
 * Rewrite provider Location redirect so redirect_uri points to PUBLIC_EXTERNAL_API_URL.
 * Identification is done ONLY by pathname suffix (/oidc-authorize).
 */
function rewriteOidcLocation(location: string): string {
	let loc: URL;
	try {
		loc = new URL(location);
	} catch {
		return location;
	}

	const redirectUri = loc.searchParams.get('redirect_uri');
	if (!redirectUri) return location;

	let ru: URL;
	try {
		ru = new URL(redirectUri);
	} catch {
		return location;
	}

	if (!ru.pathname.endsWith('/oidc-authorize')) return location;

	const pub = new URL(env.PUBLIC_EXTERNAL_API_URL);
	ru.protocol = pub.protocol;
	ru.hostname = pub.hostname;
	ru.port = pub.port;

	loc.searchParams.set('redirect_uri', ru.toString());
	return loc.toString();
}

/**
 * OIDC passthrough proxy (redirect + cookies, NOT JSON)
 */
async function proxyOidc(event: Parameters<Handle>[0]['event']): Promise<Response> {
	// Backend is only reachable from the SvelteKit server via API_BASE_URL
	const backendBase = API_BASE_URL.replace('/api/v2', '');
	const backendUrl = new URL(event.url.pathname, backendBase);
	backendUrl.search = event.url.search;

	// Public (browser-facing) origin from SvelteKit public env
	const pub = new URL(env.PUBLIC_EXTERNAL_API_URL);

	// Sanitize incoming headers, then inject proxy/public-origin headers
	const headers = sanitizeHeaders(event.request.headers);

	const r = await fetch(backendUrl.toString(), {
		method: event.request.method,
		redirect: 'manual',
		headers: {
			...headers,

			// Ensure Flask/Werkzeug can reconstruct the correct external URL
			// (many apps use Host and/or X-Forwarded-* when behind a proxy)
			host: pub.host,
			'X-Forwarded-Proto': pub.protocol.replace(':', ''),
			'X-Forwarded-Host': pub.host,
			'X-Forwarded-Port': pub.port || (pub.protocol === 'https:' ? '443' : '80'),

			// Preserve browser cookies for OIDC state/session continuity
			cookie: event.request.headers.get('cookie') ?? ''
		}
	});

	const out = new Headers();

	// Copy all headers except hop-by-hop and set-cookie (handled separately)
	for (const [k, v] of r.headers.entries()) {
		const lk = k.toLowerCase();
		if (lk === 'content-length' || lk === 'connection' || lk === 'transfer-encoding') continue;
		if (lk === 'set-cookie') continue;
		out.set(k, v);
	}

	// Rewrite Location ONLY for /oidc-login (provider redirect)
	const location = r.headers.get('location');
	if (location) {
		out.set(
			'location',
			event.url.pathname === '/oidc-login' ? rewriteOidcLocation(location) : location
		);
	}

	// Multi-cookie support
	copySetCookie(r.headers, out);

	return new Response(r.body, { status: r.status, headers: out });
}

/**
 * Fetches current auth state, returning it as a events.local
 */
export const handle: Handle = async ({ event, resolve }) => {
	const requestId = crypto.randomUUID();

	// Log incoming request
	if (DEV) {
		console.log(
			`[${requestId}] 📥 Request: ${event.request.method} ${event.url.pathname}${event.url.search}`
		);
	}

	if (
		(event.url.pathname === '/oidc-login' || event.url.pathname === '/oidc-authorize') &&
		(event.request.method === 'GET' || event.request.method === 'POST')
	) {
		return proxyOidc(event);
	}

	// Proxy auth requests to the backend
	if (event.url.pathname.startsWith('/api/v2/') || event.url.pathname.startsWith('/auth/')) {
		// Map the frontend auth endpoint to the correct backend endpoint without duplicating /api/v2/
		const apiUrl = event.url.pathname.startsWith('/auth/')
			? `${API_BASE_URL}/auth/${event.url.pathname.replace('/auth/', '')}`
			: `${API_BASE_URL.replace('/api/v2', '')}${event.url.pathname}`;

		console.log(`Proxying ${event.request.method} request to ${apiUrl}`);

		try {
			// For POST requests, we need to handle the body specially
			if (event.request.method === 'POST') {
				// Clone the request to read its body
				const clonedRequest = event.request.clone();
				const text = await clonedRequest.text();
				console.log(`Raw request body: ${text}`);

				let bodyObj;
				try {
					bodyObj = JSON.parse(text);
					console.log(`Parsed body: ${JSON.stringify(bodyObj)}`);
				} catch (e) {
					console.error(`Failed to parse body as JSON: ${e}`);
					bodyObj = { data: text };
				}

				// Directly create a new fetch request with stringified JSON and proper headers
				const response = await fetch(apiUrl, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify(bodyObj)
				});

				console.log(`Response from ${apiUrl}: ${response.status}`);
				console.log(`Response headers: ${JSON.stringify([...response.headers.entries()])}`);

				// Handle response
				let responseData;
				try {
					if (response.headers.get('content-type')?.includes('application/json')) {
						responseData = await response.json();
					} else {
						responseData = await response.text();
					}

					console.log(`Response data: ${JSON.stringify(responseData)}`);

					// If this was a login request and it was successful, perform redirection
					if (event.url.pathname === '/auth/login' && response.status === 200) {
						// Store the tokens in cookies if they exist in the response
						if (responseData && typeof responseData === 'object') {
							const authData = responseData.data || responseData;

							console.log(`Auth data: ${JSON.stringify(authData)}`);

							if (authData.access_token) {
								event.cookies.set('access_token', authData.access_token, {
									path: '/',
									httpOnly: true,
									secure: true,
									sameSite: 'strict',
									maxAge: 60 * 60 // 1 hour
								});
							}

							if (authData.refresh_token) {
								event.cookies.set('refresh_token', authData.refresh_token, {
									path: '/',
									httpOnly: true,
									secure: true,
									sameSite: 'strict',
									maxAge: 7 * 24 * 60 * 60 // 7 days
								});
							}

							// Set successful login flag for redirection
							return new Response(
								JSON.stringify({
									success: true,
									redirect: '/',
									...responseData
								}),
								{
									status: 200,
									headers: {
										'Content-Type': 'application/json',
										// Copy needed headers
										...Object.fromEntries(
											[...response.headers.entries()].filter(
												([key]) => !['content-length', 'connection'].includes(key.toLowerCase())
											)
										)
									}
								}
							);
						}
					}

					return new Response(JSON.stringify(responseData), {
						status: response.status,
						headers: {
							'Content-Type': 'application/json',
							// Copy needed headers
							...Object.fromEntries(
								[...response.headers.entries()].filter(
									([key]) => !['content-length', 'connection'].includes(key.toLowerCase())
								)
							)
						}
					});
				} catch (err) {
					console.error(`Error processing response: ${err}`);
					return new Response(JSON.stringify({ error: 'Failed to process response' }), {
						status: 500,
						headers: { 'Content-Type': 'application/json' }
					});
				}
			} else {
				// For non-POST requests, use the existing code
				// Create sanitized headers
				const headers = sanitizeHeaders(event.request.headers);
				const cookie = event.request.headers.get('cookie');

				// Public (browser-facing) origin (same logic as OIDC passthrough)
				const pub = new URL(env.PUBLIC_EXTERNAL_API_URL);

				// Send the request to backend API
				const response = await fetch(apiUrl, {
					method: event.request.method,
					headers: {
						...headers,

						// Preserve browser cookies so session-based auth (OIDC) works
						...(cookie ? { cookie } : {}),

						// Ensure backend can reconstruct public origin consistently
						host: pub.host,
						'X-Forwarded-Proto': pub.protocol.replace(':', ''),
						'X-Forwarded-Host': pub.host,
						'X-Forwarded-Port': pub.port || (pub.protocol === 'https:' ? '443' : '80')
					}
				});

				// Get response data
				let responseData;
				const contentType = response.headers.get('content-type');

				if (contentType?.includes('application/json')) {
					responseData = await response.json();
				} else {
					responseData = await response.text();
				}

				console.log(`Response data: ${JSON.stringify(responseData)}`);

				// Create headers for the proxied response (preserve Set-Cookie too)
				const out = new Headers({
					'Content-Type': 'application/json',
					...Object.fromEntries(
						[...response.headers.entries()].filter(
							([key]) => !['content-length', 'connection'].includes(key.toLowerCase())
						)
					)
				});

				copySetCookie(response.headers, out);

				// Create a new response with the data
				return new Response(JSON.stringify(responseData), {
					status: response.status,
					headers: out
				});
			}
		} catch (error) {
			console.error('Auth proxy error:', error);
			return new Response(
				JSON.stringify({
					error: 'Failed to connect to authentication service',
					details: error instanceof Error ? error.message : String(error)
				}),
				{
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				}
			);
		}
	}

	// Check authentication status for protected routes
	if (
		!AUTH_EXCLUDED_URLS.includes(event.url.pathname) &&
		!event.url.pathname.startsWith('/api/') &&
		!event.url.pathname.startsWith('/auth/')
	) {
		const accessToken = event.cookies.get('access_token');

		// Set the Authorization header if we have a token
		// but DON'T redirect - let the client handle redirects
		if (accessToken) {
			event.request.headers.set('Authorization', `Bearer ${accessToken}`);
		}
	}

	// Continue normal request handling for non-proxy paths
	const response = await resolve(event);

	// Log response
	if (DEV) {
		console.log(`[${requestId}] 📤 Response: ${response.status}`);
	}

	return response;
};

// Helper function for building API URLs consistently
function buildApiUrl(path: string): string {
	// Ensure path starts with a slash
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;

	// Remove trailing slash from base URL if it exists
	const baseUrl = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;

	return `${baseUrl}${normalizedPath}`;
}

// Add a handleFetch to attach auth tokens to server-side fetch requests
export const handleFetch: HandleFetch = async ({ event, request, fetch }) => {
	// Check if this is an API request that needs to be modified
	const url = new URL(request.url);

	// This is critical: forward all API requests to the backend
	if (
		url.pathname.startsWith('/api/v2/') ||
		url.pathname.startsWith('/api/') ||
		url.pathname.startsWith('/auth/')
	) {
		// For API requests, ensure we're using the correct base URL
		const path = url.pathname + url.search;
		const apiUrl = buildApiUrl(path);

		console.log(`Forwarding API request from ${request.url} to ${apiUrl}`);

		// Get authorization header from cookies if not already set in the request
		let authHeader = request.headers.get('authorization');
		if (!authHeader) {
			const accessToken = event.cookies.get('access_token');
			if (accessToken) {
				authHeader = `Bearer ${accessToken}`;
			}
		}

		const additionalHeaders = authHeader ? { Authorization: authHeader } : undefined;

		// Create properly configured request
		const newRequest = createForwardingRequest(apiUrl, request, {
			additionalHeaders
		});

		return fetch(newRequest);
	}

	// For non-API requests, proceed normally
	return fetch(request);
};

import type { Handle } from '@sveltejs/kit';
import { API_BASE_URL } from '$lib/config/api.config';
import { DEV } from 'esm-env';
import { env } from '$env/dynamic/public';

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
	const backendBase = API_BASE_URL.replace(/\/api\/v2\/?$/, '');
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
		const base = event.url.pathname.startsWith('/api/v2/')
			? API_BASE_URL.replace(/\/api\/v2\/?$/, '')
			: API_BASE_URL;

		const apiUrl = `${base.replace(/\/$/, '')}${event.url.pathname}`;

		if (DEV) {
			console.log(`Proxying ${event.request.method} request to ${apiUrl}`);
		}

		try {
			// Public (browser-facing) origin (same logic as OIDC passthrough)
			const pub = new URL(env.PUBLIC_EXTERNAL_API_URL);

			// Sanitize incoming headers
			const headers = sanitizeHeaders(event.request.headers);

			// Preserve browser cookies so session-based auth (OIDC) works
			const cookie = event.request.headers.get('cookie');

			const hasBody = event.request.method !== 'GET' && event.request.method !== 'HEAD';

			const response = await fetch(apiUrl, {
				method: event.request.method,
				headers: {
					...headers,
					...(cookie ? { cookie } : {}),
					host: pub.host,
					'X-Forwarded-Proto': pub.protocol.replace(':', ''),
					'X-Forwarded-Host': pub.host,
					'X-Forwarded-Port': pub.port || (pub.protocol === 'https:' ? '443' : '80')
				},
				body: hasBody ? event.request.body : undefined,
				...(hasBody ? ({ duplex: 'half' } as RequestInit) : {})
			});

			// Preserve response headers (including Set-Cookie)
			const out = new Headers();

			for (const [k, v] of response.headers.entries()) {
				const lk = k.toLowerCase();
				if (lk === 'content-length' || lk === 'connection' || lk === 'transfer-encoding') continue;
				if (lk === 'set-cookie') continue;
				out.set(k, v);
			}

			copySetCookie(response.headers, out);

			return new Response(response.body, {
				status: response.status,
				headers: out
			});
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

	// Continue normal request handling for non-proxy paths
	const response = await resolve(event);

	// Log response
	if (DEV) {
		console.log(`[${requestId}] 📤 Response: ${response.status}`);
	}

	return response;
};

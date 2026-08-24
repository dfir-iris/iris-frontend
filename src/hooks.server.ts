import type { Handle, HandleServerError, RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { handleErrorWithSentry, sentryHandle } from '@sentry/sveltekit';
import { API_BASE_URL } from '$lib/config/api.config';
import {
	forwardedOrigin,
	isServedOrigin,
	normaliseOrigin,
	parseAllowedOrigins
} from '$lib/config/origins';
import { env } from '$env/dynamic/public';
import { env as privateEnv } from '$env/dynamic/private';
import sharp from 'sharp';
import { initSentry } from '$lib/observability/init';

// Server-side Sentry init reads its DSN from IRIS_UI_SENTRY_DSN in
// the process env. Set it in the deployment env for the Node adapter
// to phone home on `handle` / `handleError`. Client-side init still
// reads from the backend runtime-config so the browser DSN is
// dynamic; this env var is only for the SvelteKit server layer.
initSentry({
	enabled: Boolean(privateEnv.IRIS_UI_SENTRY_DSN),
	dsn: privateEnv.IRIS_UI_SENTRY_DSN ?? null,
	environment: privateEnv.IRIS_UI_SENTRY_ENVIRONMENT ?? null,
	sample_rate: Number(privateEnv.IRIS_UI_SENTRY_SAMPLE_RATE ?? 1),
	release: `iris-ui@${privateEnv.IRIS_UI_VERSION ?? 'unknown'}`
});

/**
 * Every hostname this deployment serves, beyond the one the request
 * arrived on. Read from IRIS_ALLOW_ORIGIN — the same variable the
 * backend parses in `app/cors.py`, so the two tiers cannot disagree
 * about which domains belong to this instance. See
 * `$lib/config/origins` for the parsing rules and why `*` is not
 * honoured here.
 *
 * Read once at module load: adapter-node reads its own env at startup
 * too, and a change to the list means the container is being recreated
 * anyway (env_file values are baked in at create time).
 */
const ALLOWED_ORIGINS = parseAllowedOrigins(privateEnv.IRIS_ALLOW_ORIGIN);

/**
 * Resolve the browser-visible origin (protocol + host + port) for this
 * request.
 *
 * Historically this file always read PUBLIC_EXTERNAL_API_URL from the
 * env at module load. That breaks any deployment where the same
 * container serves more than one hostname — e.g. a tenant with both a
 * slug URL (foo.example.com) AND a custom domain (iris.acme.corp).
 * The env var is a single value, so requests coming in on the "wrong"
 * host got redirect_uris + Host headers pointing at the other one,
 * cookies never stuck, and CSRF/OIDC broke.
 *
 * event.url is the URL SvelteKit built from the incoming request. When
 * HOST_HEADER=x-forwarded-host + PROTOCOL_HEADER=x-forwarded-proto are
 * set (both are in every reasonable reverse-proxy deployment), it
 * reflects exactly what the browser sees.
 *
 * It stops reflecting that the moment adapter-node's ORIGIN is set:
 * ORIGIN wins over HOST_HEADER (`base: origin || get_origin(...)` in
 * handler.js), pinning event.url to one hostname for every request.
 * Deployments provisioned before ORIGIN was dropped still carry it, and
 * a container keeps its env until it is recreated — so we cannot rely
 * on event.url alone. The proxy-reported hostname is checked first and
 * wins when the operator listed it in IRIS_ALLOW_ORIGIN.
 *
 * Gating on the allow-list is what makes trusting the header safe:
 * x-forwarded-host is attacker-settable on a request that doesn't pass
 * through the proxy, and without the check a spoofed value would move
 * the origin — and with it the Host forwarded upstream and the OIDC
 * redirect_uri — somewhere this deployment doesn't serve.
 *
 * Falls back to PUBLIC_EXTERNAL_API_URL only when neither source
 * helps — kept for the tiny window during boot when event.url isn't
 * available (build-time, tests).
 */
function publicOrigin(event: Pick<RequestEvent, 'url' | 'request'>): URL {
	const forwarded = forwardedOrigin(event.request.headers);
	if (isServedOrigin(forwarded, ALLOWED_ORIGINS)) {
		return new URL(forwarded);
	}

	if (event.url) {
		return new URL(`${event.url.protocol}//${event.url.host}`);
	}
	const fallback = env.PUBLIC_EXTERNAL_API_URL;
	if (!fallback) {
		// Both sources absent — no way to build a public origin. Callers
		// pass the returned URL as `host` + `X-Forwarded-*` for the
		// upstream Flask app; a bogus URL there is safer than a crash
		// at import/first-request. Return the resolvable loopback so
		// upstream logs make the misconfiguration obvious.
		return new URL('http://localhost');
	}
	return new URL(fallback);
}

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
 * Rewrite provider Location redirect so redirect_uri points at the
 * browser-visible origin (see publicOrigin).
 * Identification is done ONLY by pathname suffix (/oidc-authorize).
 */
function rewriteOidcLocation(location: string, pub: URL): string {
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

	ru.protocol = pub.protocol;
	ru.hostname = pub.hostname;
	ru.port = pub.port;

	loc.searchParams.set('redirect_uri', ru.toString());
	return loc.toString();
}

/**
 * Decide if PNG should be recolored
 */
function shouldInvertGraphPng(url: URL): boolean {
	if (!url.pathname.startsWith('/static/assets/img/graph/')) return false;
	if (!url.pathname.toLowerCase().endsWith('.png')) return false;
	return url.searchParams.get('theme') === 'dark';
}

/**
 * Recolor monochrome PNG -> light color (preserve alpha)
 */
async function handleInvertGraphImage(
	event: Parameters<Handle>[0]['event'],
	response: Response
): Promise<Response | null> {
	if (!shouldInvertGraphPng(event.url)) return null;
	if (!response.ok) return null;

	const contentType = response.headers.get('content-type') ?? '';
	if (!contentType.includes('image/png')) return null;

	const input = Buffer.from(await response.arrayBuffer());

	const { data, info } = await sharp(input)
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	for (let i = 0; i < data.length; i += info.channels) {
		const alpha = data[i + 3];
		if (alpha === 0) continue;

		data[i] = 255;
		data[i + 1] = 255;
		data[i + 2] = 255;
	}

	const output = await sharp(data, {
		raw: {
			width: info.width,
			height: info.height,
			channels: info.channels
		}
	})
		.png()
		.toBuffer();

	const headers = new Headers(response.headers);

	headers.set('content-type', 'image/png');
	headers.set('content-length', String(output.byteLength));
	headers.set('cache-control', 'no-cache');

	return new Response(new Uint8Array(output), {
		status: response.status,
		statusText: response.statusText,
		headers
	});
}

/**
 * OIDC passthrough proxy (redirect + cookies, NOT JSON)
 */
async function proxyOidc(event: Parameters<Handle>[0]['event']): Promise<Response> {
	const backendBase = API_BASE_URL.replace(/\/api\/v2\/?$/, '');
	const backendUrl = new URL(event.url.pathname, backendBase);
	backendUrl.search = event.url.search;

	// Public (browser-facing) origin — derived from the incoming
	// request so multi-hostname deployments (slug + custom domain)
	// get correct Host + X-Forwarded-* headers passed to the backend.
	const pub = publicOrigin(event);

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
			event.url.pathname === '/oidc-login' ? rewriteOidcLocation(location, pub) : location
		);
	}

	// Multi-cookie support
	copySetCookie(r.headers, out);

	return new Response(r.body, { status: r.status, headers: out });
}

/**
 * Fetches current auth state, returning it as a events.local
 */
/**
 * CSRF origin guard — replaces SvelteKit's built-in checkOrigin, which
 * compares against a single Host value and therefore rejects every
 * state-changing request that arrives on a custom domain.
 *
 * Logic mirrors what SvelteKit does internally, widened by one rule:
 * for any state-mutating method (POST/PUT/PATCH/DELETE) carrying an
 * Origin header, the origin must be one this deployment serves —
 * either the request's own origin as SvelteKit sees it via event.url,
 * or one of the hostnames listed in IRIS_ALLOW_ORIGIN.
 *
 * The second arm is the whole point. event.url is frozen to a single
 * hostname whenever adapter-node's ORIGIN is set (see `publicOrigin`),
 * and it is also wrong behind a proxy that doesn't forward
 * x-forwarded-host — in both cases a browser sitting on a perfectly
 * legitimate hostname for this instance got a 403 on every POST, which
 * in practice means nobody can log in there. Matching against the
 * operator's own list of hostnames is not a weakening: an origin has
 * to have been configured for this deployment to pass, and a
 * cross-site attacker's origin never is.
 *
 * Requests with no Origin header (same-site navigations,
 * server-to-server) pass, as they do in SvelteKit.
 */
const csrfHandle: Handle = async ({ event, resolve }) => {
	const method = event.request.method.toUpperCase();
	const isMutating = method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS';

	if (isMutating) {
		const origin = event.request.headers.get('origin');
		if (origin !== null) {
			const normalised = normaliseOrigin(origin);
			const sameOrigin = normalised !== null && normalised === normaliseOrigin(event.url.origin);

			if (!sameOrigin && !isServedOrigin(normalised, ALLOWED_ORIGINS)) {
				return new Response(
					JSON.stringify({ message: 'Cross-Site POST submissions are forbidden' }),
					{
						status: 403,
						headers: { 'Content-Type': 'application/json' }
					}
				);
			}
		}
	}

	return resolve(event);
};

const irisHandle: Handle = async ({ event, resolve }) => {
	if (
		(event.url.pathname === '/oidc-login' || event.url.pathname === '/oidc-authorize') &&
		(event.request.method === 'GET' || event.request.method === 'POST')
	) {
		return proxyOidc(event);
	}

	// Proxy auth requests to the backend
	if (
		event.url.pathname.startsWith('/api/v2/') ||
		event.url.pathname.startsWith('/auth/') ||
		event.url.pathname.startsWith('/static/')
	) {
		const base =
			event.url.pathname.startsWith('/api/v2/') || event.url.pathname.startsWith('/static/')
				? API_BASE_URL.replace(/\/api\/v2\/?$/, '')
				: API_BASE_URL;

		const { pathname } = event.url;

		const apiUrl = `${base.replace(/\/$/, '')}${pathname}${event.url.search}`;

		try {
			// Public (browser-facing) origin — see publicOrigin(). Using
			// event.url instead of the env var lets a single container
			// serve both the tenant slug URL and a custom domain
			// correctly: cookies stick to the domain the browser is on,
			// and CSRF/Origin checks upstream in Flask see the actual
			// host rather than a fixed configured one.
			const pub = publicOrigin(event);

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

			const graphImage = await handleInvertGraphImage(event, response);
			if (graphImage) return graphImage;

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
	return resolve(event);
};

// Sentry's server handler wraps everything with an active span so
// `handleError` events land with the request context attached.
export const handle: Handle = sequence(sentryHandle(), csrfHandle, irisHandle);

const fallbackHandleError: HandleServerError = ({ error, event }) => {
	const message = error instanceof Error ? error.message : 'Server error';
	return {
		message,
		route: event.route?.id ?? undefined
	};
};

export const handleError = handleErrorWithSentry(fallbackHandleError);

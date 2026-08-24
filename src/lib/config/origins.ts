/**
 * Which hostnames this deployment answers on.
 *
 * One IRIS instance is not necessarily reachable under a single name.
 * It is provisioned with a hostname, and the operator may then point
 * one or more further domains at the very same stack — every one of
 * them is a legitimate origin for the same application.
 *
 * The backend already models that: `IRIS_ALLOW_ORIGIN` is a comma- or
 * whitespace-separated list, parsed in `app/cors.py`. This tier had no
 * notion of it and derived the one true origin from `event.url` alone,
 * which is only correct while the reverse proxy sets `x-forwarded-host`
 * AND adapter-node's `ORIGIN` is unset. With `ORIGIN` set, adapter-node
 * freezes `event.url` to that single hostname whatever the browser
 * actually used, and every state-changing request arriving on another
 * one is rejected as cross-site.
 *
 * Reading the same variable the backend reads gives both tiers one
 * source of truth for the deployment's hostnames.
 */

/** The backend's "any origin" value. Never widens anything here — see `parseAllowedOrigins`. */
const ANY_ORIGIN = '*';

/**
 * Reduce `value` to a bare `scheme://host[:port]`, the form a browser
 * sends in `Origin`. Accepts anything URL-ish an operator is likely to
 * write — a full URL with a path, a trailing slash, mixed case — and
 * returns null when there is no usable scheme + host pair.
 *
 * A bare hostname (`iris.example.com`) yields null on purpose: there is
 * no safe guess for the scheme, and guessing would silently authorise
 * the plaintext variant too. Same rule as the backend's
 * `normalise_origin`.
 */
export function normaliseOrigin(value: string | null | undefined): string | null {
	const candidate = (value ?? '').trim();
	if (!candidate || candidate === ANY_ORIGIN) return null;

	let url: URL;
	try {
		url = new URL(candidate);
	} catch {
		return null;
	}
	if (!url.protocol || !url.host) return null;

	// `URL.host` already drops userinfo and the default port; lowercase
	// the rest so `HTTPS://Iris.Example` matches `https://iris.example`.
	return `${url.protocol}//${url.host}`.toLowerCase();
}

/**
 * Parse `IRIS_ALLOW_ORIGIN` into the extra origins this deployment
 * serves. Separators are commas and whitespace, so `a,b`, `a b` and a
 * value spanning several lines all parse. Order is preserved and
 * duplicates collapse.
 *
 * `*` and an unset value both yield an empty list. That is deliberate
 * and differs from the backend, which treats `*` as "any origin": here
 * the list only ever *adds* accepted hostnames to the same-origin rule,
 * so honouring the wildcard would switch the CSRF guard off for every
 * deployment that never configured the variable. An empty list
 * reproduces exactly the behaviour this code had before the list
 * existed.
 */
export function parseAllowedOrigins(raw: string | null | undefined): string[] {
	if (!raw) return [];

	const origins: string[] = [];
	for (const token of String(raw).split(/[,\s]+/)) {
		const origin = normaliseOrigin(token);
		if (origin !== null && !origins.includes(origin)) origins.push(origin);
	}
	return origins;
}

/**
 * The origin the browser is on, as reported by the reverse proxy.
 *
 * Only the first entry of a comma-separated chain is the client-facing
 * one; the rest were added by intermediate hops. Returns null when no
 * `x-forwarded-host` is present — the `vite dev` loop and any direct
 * hit on the container, where `event.url` is already right.
 *
 * `x-forwarded-proto` defaults to https rather than to the scheme of
 * the inbound connection: the connection reaching this process is
 * plaintext inside the compose network on every real deployment, so
 * copying it would downgrade the origin.
 */
export function forwardedOrigin(headers: Headers): string | null {
	const host = headers.get('x-forwarded-host')?.split(',')[0]?.trim();
	if (!host) return null;

	const proto = headers.get('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
	return normaliseOrigin(`${proto}://${host}`);
}

/**
 * Is `origin` one of the extra hostnames the operator configured?
 *
 * Used to decide whether a proxy-supplied `x-forwarded-host` may
 * override `event.url`, and whether a cross-origin POST is in fact a
 * same-deployment one. Membership is exact on scheme + host + port,
 * per the CORS spec's definition of an origin — no wildcard
 * subdomains, matching the backend.
 */
export function isServedOrigin(
	origin: string | null | undefined,
	allowedOrigins: readonly string[]
): origin is string {
	const normalised = normaliseOrigin(origin);
	return normalised !== null && allowedOrigins.includes(normalised);
}

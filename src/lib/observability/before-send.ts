// Client-side symmetric of the backend redactor
// (source/app/iris_engine/observability/redaction.py). Runs in the
// browser via `Sentry.init({ beforeSend, beforeBreadcrumb })` so no
// case content (IOCs, evidence, credentials) rides an event payload
// off the box. IRIS data is DFIR-sensitive; the operator's browser
// often has the same secrets loaded in memory that the backend does,
// so any user-facing capture path is a real leak surface.
//
// Both hooks are pure functions of the event/breadcrumb shape.

import type { ErrorEvent, EventHint, Breadcrumb, BreadcrumbHint } from '@sentry/sveltekit';

const REDACTED = '[Filtered]';

const SENSITIVE_HEADER_RE =
	/^(authorization|cookie|proxy-authorization|x-.*-token|x-.*-key|x-api-key)$/i;

const SENSITIVE_KEY_RE =
	/secret|token|password|passwd|key|credential|api[_-]?key|dsn|cookie|session/i;

const CASE_CONTENT_KEY_RE = /ioc|evidence|malware|indicator|payload|hash|artifact/i;

function shouldRedactKey(key: string): boolean {
	return SENSITIVE_KEY_RE.test(key) || CASE_CONTENT_KEY_RE.test(key);
}

function redactMapping(input: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(input)) {
		if (typeof key === 'string' && shouldRedactKey(key)) {
			out[key] = REDACTED;
			continue;
		}
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			out[key] = redactMapping(value as Record<string, unknown>);
			continue;
		}
		out[key] = value;
	}
	return out;
}

function redactHeaders(headers: unknown): unknown {
	if (!headers || typeof headers !== 'object') return headers;
	if (Array.isArray(headers)) {
		return headers.map((entry) => {
			if (!Array.isArray(entry) || entry.length < 1) return entry;
			const [name, value] = entry as [string, unknown];
			return [name, typeof name === 'string' && SENSITIVE_HEADER_RE.test(name) ? REDACTED : value];
		});
	}
	const obj = headers as Record<string, unknown>;
	return Object.fromEntries(
		Object.entries(obj).map(([name, value]) => [
			name,
			typeof name === 'string' && SENSITIVE_HEADER_RE.test(name) ? REDACTED : value
		])
	);
}

function redactQueryString(qs: string): string {
	if (!qs) return qs;
	// URLSearchParams handles both `?a=b&c=d` and `a=b&c=d` if we strip
	// the leading `?`.
	const leading = qs.startsWith('?') ? '?' : '';
	const params = new URLSearchParams(qs.replace(/^\?/, ''));
	for (const [key] of Array.from(params.entries())) {
		if (shouldRedactKey(key)) params.set(key, REDACTED);
	}
	return leading + params.toString();
}

// ---- Noise filters ------------------------------------------------
//
// A tracker only works if its contents mean something. At the time this was
// written 26 of 29 unresolved issues were noise: 23 stale-chunk errors from
// somebody's dev server, 2 more dev-machine crashes, and one browser
// extension. Resolving those by hand does not help — the next `vite dev`
// rebuild produces fresh chunk hashes, fresh fingerprints and fresh issue IDs.
// They have to be dropped before they are sent.

// Loopback only. Deliberately NOT the private ranges — IRIS is an on-prem
// DFIR tool and a 10.x / 192.168.x deployment is a real customer whose errors
// we want. The failure mode of guessing wrong here is silence, which is worse
// than noise.
const DEV_HOSTNAME_RE = /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?|0\.0\.0\.0|.+\.localhost)$/i;

// Cross-origin and browser-quirk signatures. Each of these is defined by
// carrying no actionable information — the browser has already withheld the
// detail that would make it actionable.
const NOISE_MESSAGE_RE = new RegExp(
	[
		// Classic cross-origin sanitisation: no file, no line, no stack.
		'^Script error\\.?$',
		// Firefox's equivalent when a foreign origin (extension, iframe)
		// touches a function across the boundary. The only frame is our own
		// global `onerror` handler, so there is nothing to fix.
		'^Permission denied to access property',
		// Layout quirk, not a fault: fires when a ResizeObserver callback
		// resizes its own observed element. Harmless and extremely chatty.
		'^ResizeObserver loop'
	].join('|')
);

const EXTENSION_FRAME_RE = /^(chrome|moz|safari(-web)?|ms-browser)-extension:\/\//i;

function hostnameOf(url: string): string | null {
	try {
		return new URL(url).hostname;
	} catch {
		return null;
	}
}

/**
 * True when the event came from a developer's own machine.
 *
 * A dev server reporting into the shared tracker is the actual defect — the
 * right place to fix it is the DSN configuration — but this is the guard that
 * holds regardless of how any individual box is set up.
 */
function isLocalDevEvent(event: ErrorEvent): boolean {
	const url = event.request?.url;
	if (typeof url !== 'string') return false;
	const host = hostnameOf(url);
	return host !== null && DEV_HOSTNAME_RE.test(host);
}

function messagesOf(event: ErrorEvent): string[] {
	const out: string[] = [];
	if (typeof event.message === 'string') out.push(event.message);
	for (const value of event.exception?.values ?? []) {
		if (typeof value.value === 'string') out.push(value.value);
	}
	return out;
}

/** Every frame belongs to a browser extension, so none of it is our code. */
function isExtensionOnly(event: ErrorEvent): boolean {
	const frames = (event.exception?.values ?? []).flatMap((value) => value.stacktrace?.frames ?? []);
	if (frames.length === 0) return false;
	return frames.every(
		(frame) => typeof frame.filename === 'string' && EXTENSION_FRAME_RE.test(frame.filename)
	);
}

/**
 * Decide whether an event is worth sending at all.
 *
 * Note what is deliberately NOT filtered:
 *
 *  - "error loading dynamically imported module". On localhost it is a stale
 *    chunk from a rebuild and the host check above already drops it. On a real
 *    deployment it means a user held a tab open across a deploy, which is worth
 *    knowing — a steady trickle would point at a caching or rollout problem.
 *    Matching the message would discard both.
 *  - The bug-report dialog's own submissions, which arrive as `level: info`.
 *    They are the feature working.
 */
export function shouldDropEvent(event: ErrorEvent): boolean {
	if (isLocalDevEvent(event)) return true;
	if (messagesOf(event).some((message) => NOISE_MESSAGE_RE.test(message))) return true;
	if (isExtensionOnly(event)) return true;
	return false;
}

export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
	// Drop first: redaction is pure overhead on an event that isn't going out.
	if (shouldDropEvent(event)) return null;

	const request = event.request;
	if (request && typeof request === 'object') {
		if (request.headers) request.headers = redactHeaders(request.headers) as typeof request.headers;
		// Cookies are dropped when send_default_pii=false but we blank
		// the key here for defense in depth.
		delete request.cookies;
		if (typeof request.query_string === 'string') {
			request.query_string = redactQueryString(request.query_string);
		}
		if (request.data && typeof request.data === 'object') {
			request.data = redactMapping(request.data as Record<string, unknown>);
		} else if (typeof request.data === 'string' && request.data.length > 0) {
			request.data = '[redacted-body]';
		}
	}
	return event;
}

const DROP_BREADCRUMB_CATEGORIES = new Set(['ui.click', 'fetch']);

export function beforeBreadcrumb(crumb: Breadcrumb, _hint?: BreadcrumbHint): Breadcrumb | null {
	// `fetch` breadcrumbs include the full URL — which can carry an
	// IOC value in a query string. Drop the auto ones; the api client
	// leaves its own richer breadcrumb via ApiLogger.
	if (crumb.category && DROP_BREADCRUMB_CATEGORIES.has(crumb.category)) {
		if (crumb.data && typeof crumb.data === 'object') {
			crumb.data = redactMapping(crumb.data as Record<string, unknown>);
		}
	}
	if (crumb.data && typeof crumb.data === 'object') {
		crumb.data = redactMapping(crumb.data as Record<string, unknown>);
	}
	return crumb;
}

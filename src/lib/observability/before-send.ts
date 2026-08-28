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

export function beforeSend(event: ErrorEvent, _hint: EventHint): ErrorEvent | null {
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

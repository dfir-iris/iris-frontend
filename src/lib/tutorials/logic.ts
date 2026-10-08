/**
 * Pure helpers behind the tutorial engine — no DOM, no stores — so the
 * matching rules can be unit tested in isolation.
 */
import type { ApiEvent } from '$lib/services/api-events';
import type { ApiWait, TutorialVars } from './types';

const VAR_RE = /\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

export const interpolate = (template: string, vars: TutorialVars): string =>
	template.replace(VAR_RE, (whole, name: string) =>
		vars[name] === undefined ? whole : String(vars[name])
	);

/** Names a template uses that `vars` does not provide yet. */
export const missingVars = (template: string, vars: TutorialVars): string[] =>
	[...template.matchAll(VAR_RE)].map((m) => m[1]).filter((name) => vars[name] === undefined);

export const normalisePath = (path: string): string => {
	const bare = path.split(/[?#]/)[0];
	return bare.length > 1 ? bare.replace(/\/+$/, '') : bare;
};

export const matchesPath = (
	pattern: string | RegExp,
	actual: string,
	vars: TutorialVars
): boolean => {
	if (pattern instanceof RegExp) return pattern.test(normalisePath(actual));
	if (missingVars(pattern, vars).length > 0) return false;
	return normalisePath(interpolate(pattern, vars)) === normalisePath(actual);
};

export const matchesApi = (wait: ApiWait, event: ApiEvent, vars: TutorialVars): boolean =>
	event.ok && event.method === wait.method && matchesPath(wait.path, event.path, vars);

/**
 * Some v2 endpoints wrap the entity in `{ status, message, data }`,
 * others return it bare. Accept both (same rule as the e2e helpers).
 */
export const unwrapEnvelope = (body: unknown): unknown => {
	if (body && typeof body === 'object' && 'status' in body && 'data' in body) {
		const inner = (body as { data: unknown }).data;
		if (inner && typeof inner === 'object') return inner;
	}
	return body;
};

export const readPath = (source: unknown, dotted: string): unknown => {
	let current: unknown = source;
	for (const key of dotted.split('.')) {
		if (current === null || typeof current !== 'object') return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
};

export const captureVars = (wait: ApiWait, body: unknown): TutorialVars => {
	const captured: TutorialVars = {};
	if (!wait.capture) return captured;
	const entity = unwrapEnvelope(body);
	for (const [name, dotted] of Object.entries(wait.capture)) {
		const value = readPath(entity, dotted);
		if (typeof value === 'string' || typeof value === 'number') captured[name] = value;
	}
	return captured;
};

/** A bare `data-tour` name, or any CSS selector passed through. */
export const anchorSelector = (anchor: string): string =>
	/^[a-z0-9-]+$/.test(anchor) ? `[data-tour="${anchor}"]` : anchor;

export type InlineSegment = { kind: 'text' | 'strong' | 'code'; text: string };

/** Splits `**bold**` and `` `code` `` out of a step body; everything else is text. */
export const parseInline = (source: string): InlineSegment[] => {
	const segments: InlineSegment[] = [];
	const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
	let last = 0;
	for (const match of source.matchAll(re)) {
		const index = match.index ?? 0;
		if (index > last) segments.push({ kind: 'text', text: source.slice(last, index) });
		if (match[1] !== undefined) segments.push({ kind: 'strong', text: match[1] });
		else segments.push({ kind: 'code', text: match[2] });
		last = index + match[0].length;
	}
	if (last < source.length) segments.push({ kind: 'text', text: source.slice(last) });
	return segments;
};

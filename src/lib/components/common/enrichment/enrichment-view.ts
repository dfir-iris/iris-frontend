/**
 * Readable view of an enrichment payload. The payload has no fixed
 * shape (each module or workflow writes its own key), so each top-level
 * key becomes a source, and what can be shown on one line (scalars,
 * short lists of scalars) becomes a field. A source's `summary` and
 * `link` are lifted out; nested objects stay in the raw JSON view.
 */

export interface EnrichmentField {
	label: string;
	value: string;
}

export interface EnrichmentSource {
	key: string;
	label: string;
	summary: string | null;
	/** http(s) only: anything else is not rendered as a link. */
	link: string | null;
	verdict: string | null;
	fields: EnrichmentField[];
	/** Whether some values (nested objects) are only in the raw view. */
	hasMore: boolean;
}

const LABELS: Record<string, string> = {
	virustotal: 'VirusTotal',
	misp: 'MISP',
	vt: 'VirusTotal'
};

/** Shown in the header of the source, not as fields. */
const LIFTED = new Set(['summary', 'link', 'verdict']);
const MAX_FIELDS = 40;
const MAX_LIST = 15;
const MAX_VALUE = 300;

export function enrichmentLabel(key: string): string {
	if (LABELS[key.toLowerCase()]) return LABELS[key.toLowerCase()];
	const words = key.replace(/[_-]+/g, ' ').trim();
	return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

function isScalar(value: unknown): value is string | number | boolean {
	return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isEmpty(value: unknown): boolean {
	if (value === null || value === undefined || value === '') return true;
	if (Array.isArray(value)) return value.length === 0;
	return typeof value === 'object' && Object.keys(value as object).length === 0;
}

function cut(text: string): string {
	return text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text;
}

/** One line for `value`, or null when it only fits the raw view. */
function line(value: unknown): string | null {
	if (value === null || value === undefined || value === '') return null;
	if (isScalar(value)) return cut(String(value));
	if (Array.isArray(value)) {
		if (!value.length || !value.every(isScalar)) return null;
		const more = value.length > MAX_LIST ? ` (+${value.length - MAX_LIST})` : '';
		return cut(value.slice(0, MAX_LIST).map(String).join(', ') + more);
	}
	return null;
}

export function enrichmentSafeLink(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
	} catch {
		return null;
	}
}

function source(key: string, value: unknown): EnrichmentSource {
	const base = { key, label: enrichmentLabel(key), summary: null, link: null, verdict: null };
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		const text = line(value);
		return {
			...base,
			fields: text === null ? [] : [{ label: 'Value', value: text }],
			hasMore: text === null && !isEmpty(value)
		};
	}
	const record = value as Record<string, unknown>;
	const fields: EnrichmentField[] = [];
	let hasMore = false;
	for (const [name, item] of Object.entries(record)) {
		if (LIFTED.has(name)) continue;
		const text = line(item);
		if (text === null) {
			if (!isEmpty(item)) hasMore = true;
			continue;
		}
		if (fields.length < MAX_FIELDS) fields.push({ label: enrichmentLabel(name), value: text });
		else hasMore = true;
	}
	return {
		...base,
		summary: typeof record.summary === 'string' && record.summary.trim() ? record.summary : null,
		link: enrichmentSafeLink(record.link),
		verdict: typeof record.verdict === 'string' && record.verdict ? record.verdict : null,
		fields,
		hasMore
	};
}

/** The sources of an enrichment payload, in the order they were written. */
export function enrichmentSources(enrichment: unknown): EnrichmentSource[] {
	if (enrichment === null || typeof enrichment !== 'object' || Array.isArray(enrichment)) return [];
	return Object.entries(enrichment as Record<string, unknown>).map(([key, value]) =>
		source(key, value)
	);
}

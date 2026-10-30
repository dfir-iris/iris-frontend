import type { GraphEdge, GraphNode } from '$lib/types/resources/case-graph';
import { isStoredEdge, KIND_LABEL } from './model';

export type SortDir = 'asc' | 'desc';

export interface SortState<C extends string> {
	column: C;
	dir: SortDir;
}

export interface NodeRow {
	key: string;
	node: GraphNode;
	kind: string;
	label: string;
	type: string;
	subtitle: string;
	tags: string;
	flags: string;
	compromised: boolean;
	firstSeen: string | null;
	lastSeen: string | null;
	degree: number;
	events: number;
}

export type NodeColumn =
	| 'label'
	| 'kind'
	| 'type'
	| 'subtitle'
	| 'tags'
	| 'firstSeen'
	| 'lastSeen'
	| 'degree'
	| 'events';

export interface EdgeRow {
	key: string;
	edge: GraphEdge;
	stored: boolean;
	source: string;
	target: string;
	relation: string;
	label: string;
	directed: boolean;
	confidence: number | null;
	origin: string;
	review: string;
	count: number;
	firstSeen: string | null;
}

export type EdgeColumn =
	| 'source'
	| 'relation'
	| 'target'
	| 'confidence'
	| 'origin'
	| 'review'
	| 'count'
	| 'firstSeen';

export const nodeRow = (n: GraphNode, degree: number): NodeRow => ({
	key: n.key,
	node: n,
	kind: KIND_LABEL[n.kind] ?? n.kind,
	label: n.label ?? '',
	type: n.type ?? '',
	subtitle: n.subtitle ?? '',
	tags: (n.tags ?? []).join(', '),
	flags: (n.flags ?? []).map((f) => f.name).join(', '),
	compromised: n.compromised === true,
	firstSeen: n.first_seen ?? null,
	lastSeen: n.last_seen ?? null,
	degree,
	events: n.event_count ?? 0
});

export const edgeRow = (e: GraphEdge, labelOf: (key: string) => string): EdgeRow => ({
	key: e.key,
	edge: e,
	stored: isStoredEdge(e),
	source: labelOf(e.source),
	target: labelOf(e.target),
	relation: e.relation?.label || e.relation?.name || '',
	label: e.label ?? '',
	directed: e.directed,
	confidence: e.confidence,
	origin: e.origin,
	review: e.review_state,
	count: e.count ?? 1,
	firstSeen: e.first_seen
});

/**
 * Edges kept by the graph search: with an active query (`matches` not null)
 * an edge stays when one of its ends matches.
 */
export const edgeMatchesSearch = (e: GraphEdge, matches: Set<string> | null) =>
	!matches || matches.has(e.source) || matches.has(e.target);

const cmp = (a: unknown, b: unknown): number => {
	const empty = (v: unknown) => v === null || v === undefined || v === '';
	if (empty(a) && empty(b)) return 0;
	if (empty(a)) return 1;
	if (empty(b)) return -1;
	if (typeof a === 'number' && typeof b === 'number') return a - b;
	if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
	return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

/** Sorted copy; empty values always last, ties broken by key. */
export const sortRows = <R extends { key: string }>(
	rows: R[],
	sort: { column: keyof R; dir: SortDir } | null
): R[] => {
	if (!sort) return rows;
	const sign = sort.dir === 'asc' ? 1 : -1;
	return [...rows].sort((a, b) => {
		const va = a[sort.column];
		const vb = b[sort.column];
		const emptyA = va === null || va === undefined || va === '';
		const emptyB = vb === null || vb === undefined || vb === '';
		if (emptyA !== emptyB) return emptyA ? 1 : -1;
		return sign * cmp(va, vb) || cmp(a.key, b.key);
	});
};

/** Next sort when a header is clicked: asc → desc → none. */
export const nextSort = <C extends string>(
	current: SortState<C> | null,
	column: C
): SortState<C> | null => {
	if (!current || current.column !== column) return { column, dir: 'asc' };
	if (current.dir === 'asc') return { column, dir: 'desc' };
	return null;
};

export const ariaSort = <C extends string>(sort: SortState<C> | null, column: C) =>
	sort?.column === column ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none';

/** Rows whose given fields contain every whitespace-separated token of `text`. */
export const filterRows = <R>(rows: R[], text: string, fields: (keyof R)[]): R[] => {
	const tokens = text.toLowerCase().split(/\s+/).filter(Boolean);
	if (!tokens.length) return rows;
	return rows.filter((r) => {
		const hay = fields
			.map((f) => r[f])
			.filter((v) => v !== null && v !== undefined)
			.map((v) => String(v).toLowerCase())
			.join('\n');
		return tokens.every((t) => hay.includes(t));
	});
};

/**
 * Checkbox click with shift-range support. Returns the new selection: the
 * range between `anchor` and `key` (in `ordered`) takes the clicked state.
 */
export const toggleRowSelection = (
	selected: ReadonlySet<string>,
	key: string,
	{ ordered, anchor, range }: { ordered: string[]; anchor?: string | null; range?: boolean }
): Set<string> => {
	const next = new Set(selected);
	const on = !selected.has(key);
	const from = anchor ? ordered.indexOf(anchor) : -1;
	const to = ordered.indexOf(key);
	if (range && from >= 0 && to >= 0) {
		const [lo, hi] = from < to ? [from, to] : [to, from];
		for (const k of ordered.slice(lo, hi + 1)) {
			if (on) next.add(k);
			else next.delete(k);
		}
	} else if (on) next.add(key);
	else next.delete(key);
	return next;
};

/** Header checkbox state for the selectable keys currently listed. */
export const headerSelection = (
	selected: ReadonlySet<string>,
	listed: string[]
): 'all' | 'some' | 'none' => {
	if (!listed.length) return 'none';
	const n = listed.filter((k) => selected.has(k)).length;
	return n === 0 ? 'none' : n === listed.length ? 'all' : 'some';
};

/** Parse an inline confidence input: '' → null, else an integer 0-100 or undefined (invalid). */
export const parseConfidence = (raw: string): number | null | undefined => {
	const s = raw.trim().replace(/%$/, '');
	if (!s) return null;
	if (!/^\d{1,3}$/.test(s)) return undefined;
	const n = Number(s);
	return n <= 100 ? n : undefined;
};

/** Page of rows (1-based page clamped to the range). */
export const pageOf = <R>(rows: R[], page: number, size: number) => {
	const pages = Math.max(1, Math.ceil(rows.length / size));
	const p = Math.min(Math.max(1, page), pages);
	return { rows: rows.slice((p - 1) * size, p * size), page: p, pages };
};

/** CSV of the listed rows (for a quick copy into a report). */
export const toCsv = (header: string[], rows: (string | number | boolean | null)[][]) => {
	const cell = (v: string | number | boolean | null) => {
		const s = v === null ? '' : String(v);
		const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
		return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
	};
	return [header, ...rows].map((r) => r.map(cell).join(',')).join('\n');
};

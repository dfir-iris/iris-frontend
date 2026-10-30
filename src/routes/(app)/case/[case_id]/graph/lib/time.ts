import type { GraphEdge, GraphNode, GraphNodeKey } from '$lib/types/resources/case-graph';
import { toTime } from './model';

/**
 * Time helpers of the graph: bounds of the dated objects, range filtering
 * (brushing) and the replay order (edges revealed by `first_seen`).
 */

export interface TimeBounds {
	min: number;
	max: number;
}

export interface TimeRange {
	from: number | null;
	to: number | null;
}

/** Start / end of a dated object; a lone date is used for both ends. */
export const spanOf = (o: {
	first_seen?: string | null;
	last_seen?: string | null;
}): { start: number; end: number } | null => {
	const a = toTime(o.first_seen);
	const b = toTime(o.last_seen);
	if (a === null && b === null) return null;
	const start = a ?? (b as number);
	const end = b ?? start;
	return start <= end ? { start, end } : { start: end, end: start };
};

/** [min first_seen, max last_seen] over the dated nodes and edges. */
export const timeBounds = (nodes: GraphNode[], edges: GraphEdge[]): TimeBounds | null => {
	let min = Infinity;
	let max = -Infinity;
	for (const o of [...nodes, ...edges]) {
		const s = spanOf(o);
		if (!s) continue;
		if (s.start < min) min = s.start;
		if (s.end > max) max = s.end;
	}
	return Number.isFinite(min) ? { min, max } : null;
};

/** Whether a dated object overlaps the range; undated objects always pass. */
export const overlaps = (
	o: { first_seen?: string | null; last_seen?: string | null },
	range: TimeRange
): boolean => {
	const s = spanOf(o);
	if (!s) return true;
	if (range.from !== null && s.end < range.from) return false;
	if (range.to !== null && s.start > range.to) return false;
	return true;
};

/** `graph.time` (ISO strings) as epoch ms; null when nothing is set. */
export const parseRange = (
	time: { from: string | null; to: string | null } | null | undefined
): TimeRange | null => {
	if (!time) return null;
	const from = toTime(time.from);
	const to = toTime(time.to);
	return from === null && to === null ? null : { from, to };
};

export const toIso = (ms: number | null): string | null =>
	ms === null ? null : new Date(ms).toISOString();

/**
 * Replay order: dated edges by `first_seen` (then `last_seen`, then key, so
 * the order is stable across refreshes). Undated edges are not replayed.
 */
export const replayOrder = (edges: GraphEdge[]): GraphEdge[] =>
	edges
		.map((e) => ({ e, s: spanOf(e) }))
		.filter((x): x is { e: GraphEdge; s: { start: number; end: number } } => x.s !== null)
		.sort((a, b) => a.s.start - b.s.start || a.s.end - b.s.end || a.e.key.localeCompare(b.e.key))
		.map((x) => x.e);

export interface ReplayFrame {
	/** Edges revealed so far. */
	edges: Set<string>;
	/** Endpoints of the revealed edges: a node appears with its first edge. */
	nodes: Set<GraphNodeKey>;
	/** Edge revealed last, null before the first step. */
	current: GraphEdge | null;
	/** `first_seen` of the last revealed edge. */
	at: number | null;
}

/** State after `step` edges of `order` are revealed (clamped). */
export const replayFrame = (order: GraphEdge[], step: number): ReplayFrame => {
	const n = Math.max(0, Math.min(order.length, Math.floor(step)));
	const edges = new Set<string>();
	const nodes = new Set<GraphNodeKey>();
	for (let i = 0; i < n; i++) {
		const e = order[i];
		edges.add(e.key);
		nodes.add(e.source);
		nodes.add(e.target);
	}
	const current = n > 0 ? order[n - 1] : null;
	return { edges, nodes, current, at: current ? (spanOf(current)?.start ?? null) : null };
};

/** Number of edges of `order` starting at or before `t` (replay seek). */
export const stepAt = (order: GraphEdge[], t: number): number => {
	let n = 0;
	for (const e of order) {
		const s = spanOf(e);
		if (!s || s.start > t) break;
		n++;
	}
	return n;
};

/** Edge counts per bucket of `first_seen`, for the slider histogram. */
export const histogram = (edges: GraphEdge[], bounds: TimeBounds, buckets = 48): number[] => {
	const out = new Array<number>(Math.max(1, buckets)).fill(0);
	const width = bounds.max - bounds.min;
	for (const e of edges) {
		const s = spanOf(e);
		if (!s) continue;
		const i = width > 0 ? Math.floor(((s.start - bounds.min) / width) * out.length) : 0;
		out[Math.max(0, Math.min(out.length - 1, i))]++;
	}
	return out;
};

/** Delay between two replay steps for a speed multiplier. */
export const replayDelay = (speed: number, base = 900) =>
	Math.max(50, Math.round(base / (speed > 0 ? speed : 1)));

import DOMPurify from 'dompurify';
import type { CyEdgeDef } from '$lib/components/common/CytoscapeGraph';

/**
 * Helpers shared by the two alert relationship graphs (alert-cluster
 * correlation graph, alert-detail related graph). Both backends emit the
 * same vis-style payload: nodes `{ id, label, title?, group, image? }` and
 * id-less edges `{ from, to, dashes? }`.
 */
export interface AlertGraphEdgeInput {
	from: string;
	to: string;
	dashes?: boolean;
}

/**
 * Edges → Cytoscape edge definitions. The payload carries no edge ids, so a
 * stable one is derived from the endpoints (with a counter for repeated
 * pairs) — the diffing keys on it. Dashed edges keep their dashes. The edges
 * are associations (alert ↔ indicator), not directed relations: no arrow.
 * Edges are not selectable: both graphs select nodes only.
 */
export const alertGraphEdges = (edges: AlertGraphEdgeInput[]): CyEdgeDef[] => {
	const seen = new Map<string, number>();
	return edges.map((e) => {
		const key = `${e.from}->${e.to}`;
		const n = seen.get(key) ?? 0;
		seen.set(key, n + 1);
		return {
			group: 'edges',
			data: {
				id: n ? `${key}#${n}` : key,
				source: e.from,
				target: e.to,
				...(e.dashes ? { lineStyle: 'dashed' } : {})
			},
			selectable: false
		};
	});
};

/** Backend titles embed user-controlled fields; only keep inline formatting. */
export const sanitizeGraphTitle = (html: string): string =>
	DOMPurify.sanitize(html, {
		ALLOWED_TAGS: ['b', 'br', 'i', 'em', 'strong', 'span'],
		ALLOWED_ATTR: []
	});

/** Titles with markup are rendered as (sanitized) HTML, the others as text. */
export const isHtmlTitle = (title: string | undefined | null): title is string =>
	typeof title === 'string' && title.includes('<');

/**
 * Truncate long labels so one verbose alert title can't shove every
 * neighbour off screen. The full text stays in the tooltip and detail rail.
 */
export const shortGraphLabel = (label: string | undefined | null, max = 42): string => {
	const v = label ?? '';
	return v.length > max ? `${v.slice(0, max - 2)}…` : v;
};

/** `alert_12` → `12`, `case_3` → `3` (split on the first underscore). */
export const graphNodeRawId = (nodeId: string): string => nodeId.split(/_/)[1];

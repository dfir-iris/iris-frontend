import type {
	GraphEdge,
	GraphLineStyle,
	GraphNode,
	GraphNodeKey,
	GraphNodeKind
} from '$lib/types/resources/case-graph';

/** Lookup structures over a node / edge set. */
export interface GraphIndex {
	nodes: Map<GraphNodeKey, GraphNode>;
	edges: Map<string, GraphEdge>;
	/** Undirected adjacency (self-loops ignored). */
	adjacency: Map<GraphNodeKey, Set<GraphNodeKey>>;
	/** Edge keys touching a node. */
	edgesOf: Map<GraphNodeKey, string[]>;
}

export const buildIndex = (nodes: GraphNode[], edges: GraphEdge[]): GraphIndex => {
	const index: GraphIndex = {
		nodes: new Map(),
		edges: new Map(),
		adjacency: new Map(),
		edgesOf: new Map()
	};
	for (const n of nodes) {
		index.nodes.set(n.key, n);
		index.adjacency.set(n.key, new Set());
		index.edgesOf.set(n.key, []);
	}
	for (const e of edges) {
		if (!index.nodes.has(e.source) || !index.nodes.has(e.target)) continue;
		index.edges.set(e.key, e);
		index.edgesOf.get(e.source)?.push(e.key);
		if (e.target !== e.source) {
			index.edgesOf.get(e.target)?.push(e.key);
			index.adjacency.get(e.source)?.add(e.target);
			index.adjacency.get(e.target)?.add(e.source);
		}
	}
	return index;
};

/** Merge node / edge lists by key; later lists win. */
export const mergeByKey = <T extends { key: string }>(...lists: T[][]): T[] => {
	const out = new Map<string, T>();
	for (const list of lists) for (const item of list) out.set(item.key, item);
	return [...out.values()];
};

/** Order-independent key of a node pair (bundle id). */
export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

export const parseNodeKey = (key: string): { kind: GraphNodeKind; id: number } | null => {
	const m = /^([a-z]+):(\d+)$/.exec(key);
	return m ? { kind: m[1] as GraphNodeKind, id: Number(m[2]) } : null;
};

export const isStoredEdge = (e: GraphEdge) => e.id !== null && e.key.startsWith('e:');
export const isDerivedEdge = (e: GraphEdge) => !isStoredEdge(e);
export const isPending = (e: GraphEdge) => e.review_state === 'pending';

/**
 * Line style by origin (§8): stored/manual solid, derived dashed, pending
 * (AI / suggestion proposals awaiting review) dotted.
 */
export const edgeLineStyle = (e: GraphEdge): GraphLineStyle => {
	if (isPending(e)) return 'dotted';
	if (isDerivedEdge(e)) return 'dashed';
	return 'solid';
};

/** Width grows with the number of supporting events, log-scaled and capped. */
export const edgeWidth = (count: number | null | undefined): number => {
	const c = Math.max(1, count ?? 1);
	return Math.round(Math.min(7, 1.5 + Math.log2(c) * 1.25) * 10) / 10;
};

/** Edges that a stored edge can be created between: every kind but `case`. */
export const isLinkable = (n: GraphNode | undefined | null) =>
	!!n && n.kind !== 'case' && n.accessible !== false;

export const KIND_LABEL: Record<GraphNodeKind, string> = {
	asset: 'Asset',
	ioc: 'IOC',
	event: 'Event',
	evidence: 'Evidence',
	task: 'Task',
	note: 'Note',
	alert: 'Alert',
	node: 'Free node',
	case: 'Case'
};

/** Palette colour of a node kind (free nodes use their own `color`). */
export const KIND_COLOR: Record<GraphNodeKind, string> = {
	asset: 'emerald',
	ioc: 'blue',
	event: 'violet',
	evidence: 'cyan',
	task: 'amber',
	note: 'yellow',
	alert: 'rose',
	node: 'zinc',
	case: 'slate'
};

export const CRITICALITY_COLOR: Record<string, string> = {
	critical: 'red',
	high: 'orange',
	medium: 'amber',
	low: 'sky',
	info: 'slate',
	informational: 'slate'
};

/** Analysis status → palette colour, matched on the lower-cased name. */
export const analysisStatusColor = (status: string | null | undefined): string | null => {
	const s = (status ?? '').toLowerCase();
	if (!s || s === 'unspecified') return null;
	if (s.includes('done') || s.includes('complete')) return 'green';
	if (s.includes('progress') || s.includes('started')) return 'amber';
	if (s.includes('pending') || s.includes('to be done')) return 'sky';
	if (s.includes('cancel')) return 'slate';
	return 'violet';
};

/** Epoch ms of an ISO-ish date, null when absent / unparsable. */
export const toTime = (iso: string | null | undefined): number | null => {
	if (!iso) return null;
	const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
	return Number.isFinite(t) ? t : null;
};

export const timelineEventUrl = (caseId: number, eventId: number) =>
	`/case/${caseId}/timeline?sharedEventId=${eventId}`;

export const truncate = (s: string, max = 32) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);

/**
 * War-room graph (§4.10 / §9.11): the union of the investigation graphs of
 * the cases attached to a war room, read-only.
 *
 * Every attached case is a `case:<id>` node (`accessible: false` and
 * labelled "Restricted case" when the caller cannot read it); every other
 * node and edge key is prefixed with its case (`c5/asset:12`, `c5/e:3`).
 * Undirected `same_as` edges (origin `cross_case`) join the same IOC or
 * managed asset across cases.
 *
 * On the canvas, a readable case is a compound node holding its objects; a
 * restricted one is a single locked node.
 */
import { paletteHex } from '$lib/components/common/CytoscapeGraph/palette';
import type {
	CyEdgeDef,
	CyElementDef,
	CyNodeDef,
	CyStylesheet
} from '$lib/components/common/CytoscapeGraph/types';
import type {
	GraphEdge,
	GraphInclude,
	GraphNode,
	GraphNodeKind,
	WarRoomGraph
} from '$lib/types/resources/case-graph';
import {
	buildElements,
	caseGraphStylesheet,
	DEFAULT_OVERLAYS,
	FAN_PREFIX,
	type ElementsOutput
} from '../../../../case/[case_id]/graph/lib/elements';
import { graphUrl, timelineEventsUrl } from '$lib/utils/graph-links';

/** The `include` values the war-room graph honours. */
export const WAR_ROOM_GRAPH_INCLUDES = [
	'events',
	'evidences',
	'tasks',
	'notes',
	'alerts'
] as const satisfies readonly GraphInclude[];

export type WarRoomGraphInclude = (typeof WAR_ROOM_GRAPH_INCLUDES)[number];

export const WAR_ROOM_INCLUDE_LABEL: Record<WarRoomGraphInclude, string> = {
	events: 'Timeline events',
	evidences: 'Evidences',
	tasks: 'Tasks',
	notes: 'Notes',
	alerts: 'Alerts'
};

/** Colours given to the cases, in attachment order. */
export const CASE_COLORS = [
	'sky',
	'violet',
	'emerald',
	'amber',
	'rose',
	'cyan',
	'lime',
	'orange',
	'indigo',
	'pink'
] as const;

export const caseColor = (index: number) => CASE_COLORS[Math.abs(index) % CASE_COLORS.length];

export const caseNodeKey = (caseId: number) => `case:${caseId}`;

export interface WarRoomKey {
	/** Case of the object; for a `case:<id>` node, that case. */
	caseId: number;
	kind: GraphNodeKind | 'e' | 'd';
	/** Key inside the case graph (`asset:12`, `e:3`, `case:5`). */
	localKey: string;
	/** Numeric id of `kind:id` keys, null for derived edge keys. */
	id: number | null;
}

/** `c5/asset:12` → case 5, `asset:12`; `case:5` → case 5. Null for anything else. */
export const parseWarRoomKey = (key: string): WarRoomKey | null => {
	const caseNode = /^case:(\d+)$/.exec(key);
	if (caseNode) {
		const id = Number(caseNode[1]);
		return { caseId: id, kind: 'case', localKey: key, id };
	}
	const m = /^c(\d+)\/(([a-z_]+):(.+))$/.exec(key);
	if (!m) return null;
	return {
		caseId: Number(m[1]),
		kind: m[3] as WarRoomKey['kind'],
		localKey: m[2],
		id: /^\d+$/.test(m[4]) ? Number(m[4]) : null
	};
};

/** Case a canvas element belongs to (folded IOC groups included), null for cross-case edges. */
export const caseIdOfElement = (id: string): number | null => {
	const key = id.startsWith(FAN_PREFIX) ? id.slice(FAN_PREFIX.length) : id;
	const m = /^c(\d+)\//.exec(key);
	return m ? Number(m[1]) : null;
};

export const isSameAsEdge = (e: Pick<GraphEdge, 'origin' | 'relation'>) =>
	e.origin === 'cross_case' || e.relation?.name === 'same_as';

/** Stored (hand-made or accepted) edge of a case: `c5/e:12`. */
export const isStoredWarRoomEdge = (key: string) => /^(?:c\d+\/)?e:\d+$/.test(key);

export interface WarRoomCase {
	id: number;
	name: string;
	accessible: boolean;
	/** Palette name. */
	color: string;
	nodeCount: number;
}

/**
 * The attached cases, in attachment order (`meta.case_ids`, else the order
 * of the `case:` nodes). A case is restricted when its node says so or when
 * it is missing from `meta.readable_case_ids`.
 */
export const warRoomCases = (graph: Pick<WarRoomGraph, 'nodes' | 'meta'>): WarRoomCase[] => {
	const caseNodes = new Map<number, GraphNode>();
	const counts = new Map<number, number>();
	for (const n of graph.nodes) {
		if (n.kind === 'case' && parseWarRoomKey(n.key)?.kind === 'case') caseNodes.set(n.id, n);
		else if (typeof n.case_id === 'number') counts.set(n.case_id, (counts.get(n.case_id) ?? 0) + 1);
	}
	const ids = [...(graph.meta?.case_ids ?? [])];
	for (const id of caseNodes.keys()) if (!ids.includes(id)) ids.push(id);
	const readable = graph.meta?.readable_case_ids ? new Set(graph.meta.readable_case_ids) : null;
	return ids.map((id, index) => {
		const node = caseNodes.get(id);
		const accessible = node?.accessible !== false && (readable ? readable.has(id) : !!node);
		return {
			id,
			name: accessible ? node?.label || `Case #${id}` : 'Restricted case',
			accessible,
			color: caseColor(index),
			nodeCount: counts.get(id) ?? 0
		};
	});
};

export interface WarRoomElementsInput {
	graph: WarRoomGraph;
	isDark: boolean;
	/** Cases whose objects are not drawn (their case node stays). */
	hiddenCases?: Set<number>;
	bundleEdges?: boolean;
	expandedBundles?: Set<string>;
	/** Assets with more leaf IOCs than this are folded; 0 disables. */
	fanoutThreshold?: number;
	expandedFanouts?: Set<string>;
	/** Search hits (null: no search). */
	matches?: Set<string> | null;
}

export interface WarRoomElementsOutput extends ElementsOutput {
	cases: WarRoomCase[];
}

/** Cytoscape elements of the war-room graph, objects nested in their case. */
export const buildWarRoomElements = (input: WarRoomElementsInput): WarRoomElementsOutput => {
	const { graph, isDark } = input;
	const hidden = input.hiddenCases ?? new Set<number>();
	const cases = warRoomCases(graph);
	const byId = new Map(cases.map((c) => [c.id, c]));

	const nodes = graph.nodes.filter((n) => {
		if (n.kind === 'case' && parseWarRoomKey(n.key)?.kind === 'case') return byId.has(n.id);
		const caseId = n.case_id ?? caseIdOfElement(n.key);
		return caseId !== null && byId.get(caseId)?.accessible === true && !hidden.has(caseId);
	});
	const keys = new Set(nodes.map((n) => n.key));
	const edges = graph.edges.filter((e) => keys.has(e.source) && keys.has(e.target));

	const out = buildElements({
		nodes,
		edges,
		visibility: { nodes: keys, edges: new Set(edges.map((e) => e.key)), offCanvas: new Set() },
		pinned: new Set(),
		positions: {},
		bundleEdges: input.bundleEdges ?? true,
		expandedBundles: input.expandedBundles ?? new Set(),
		fanoutThreshold: input.fanoutThreshold ?? 8,
		expandedFanouts: input.expandedFanouts ?? new Set(),
		forcedFanouts: new Set(),
		overlays: { ...DEFAULT_OVERLAYS },
		isDark,
		matches: input.matches ?? null
	});

	const edgeByKey = new Map(edges.map((e) => [e.key, e]));
	const sameAsColor = paletteHex('fuchsia', isDark);
	const elements: CyElementDef[] = [];
	// Case nodes first so that a compound parent always exists before its children.
	const caseDefs: CyElementDef[] = [];
	for (const def of out.elements) {
		if (def.group === 'nodes') {
			const node = def as CyNodeDef;
			const parsed = parseWarRoomKey(node.data.id);
			if (parsed?.kind === 'case') {
				caseDefs.push(caseNodeDef(node, byId.get(parsed.caseId), isDark));
				continue;
			}
			const caseId = caseIdOfElement(node.data.id);
			elements.push(
				caseId === null ? node : { ...node, data: { ...node.data, parent: caseNodeKey(caseId) } }
			);
			continue;
		}
		const edge = def as CyEdgeDef;
		const members = Array.isArray(edge.data.members)
			? (edge.data.members as string[])
			: [edge.data.id];
		const sources = members.map((k) => edgeByKey.get(k)).filter((e): e is GraphEdge => !!e);
		const classes = [...(edge.classes ?? [])];
		const data = { ...edge.data };
		if (sources.length && sources.every(isSameAsEdge)) {
			classes.push('same-as');
			data.color = sameAsColor;
			data.lineStyle = 'dashed';
			data.arrow = 'none';
			if (sources.length === 1) data.label = 'same as';
		} else if (classes.includes('bundle')) {
			// The case graph tells stored edges by an unprefixed `e:` key.
			data.lineStyle = sources.some((e) => isStoredWarRoomEdge(e.key)) ? 'solid' : 'dashed';
		} else if (classes.includes('derived') && sources.length === 1) {
			const [e] = sources;
			if (isStoredWarRoomEdge(e.key)) {
				classes.splice(classes.indexOf('derived'), 1, 'stored');
				if (e.review_state !== 'pending') data.lineStyle = 'solid';
			}
		}
		elements.push({ ...edge, data, classes });
	}

	return { ...out, elements: [...caseDefs, ...elements], cases };
};

const LOCK_ICON = (color: string) =>
	`data:image/svg+xml;utf8,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`
	)}`;

const caseNodeDef = (def: CyNodeDef, c: WarRoomCase | undefined, isDark: boolean): CyNodeDef => {
	// A compound's opacity applies to its children: a case box is never dimmed.
	const classes = (def.classes ?? []).filter((cls) => cls !== 'dimmed' && cls !== 'search-hit');
	if (!c || !c.accessible) {
		const color = paletteHex('slate', isDark);
		return {
			...def,
			data: {
				...def.data,
				label: 'Restricted case',
				fullLabel: c ? `Case #${c.id} — you cannot read it` : 'Restricted case',
				color,
				images: [LOCK_ICON(color)],
				iconScale: 0.5,
				shape: 'round-rectangle',
				borderStyle: 'dashed',
				locked: true
			},
			classes: [...classes, 'case-restricted']
		};
	}
	const color = paletteHex(c.color, isDark);
	const label = `#${c.id} ${c.name}`;
	return {
		...def,
		data: {
			...def.data,
			label: label.length > 60 ? `${label.slice(0, 59)}…` : label,
			fullLabel: label,
			color,
			bg: color,
			images: [],
			shape: 'round-rectangle',
			borderStyle: 'solid',
			borderWidth: 2
		},
		classes: [...classes, 'case-group']
	};
};

/** Rules of the war-room canvas on top of the case graph ones. */
export const warRoomGraphStylesheet = (isDark: boolean): CyStylesheet => [
	...caseGraphStylesheet(isDark),
	{
		selector: 'node.case-group',
		style: {
			'background-opacity': isDark ? 0.08 : 0.05,
			'text-valign': 'top',
			'text-halign': 'center',
			'text-margin-y': -6,
			'font-size': 13,
			'font-weight': 'bold',
			'text-max-width': '360px',
			padding: '24px',
			'border-opacity': 0.7
		}
	},
	{
		selector: 'node.case-restricted',
		style: { opacity: 0.75 }
	},
	{
		selector: 'edge.same-as',
		style: { 'line-dash-pattern': [8, 4], 'z-index': 15 }
	}
];

/** Nodes of other cases joined to `key` by a `same_as` edge. */
export const sameAsCounterparts = (
	graph: Pick<WarRoomGraph, 'nodes' | 'edges'>,
	key: string
): GraphNode[] => {
	const nodes = new Map(graph.nodes.map((n) => [n.key, n]));
	const out = new Map<string, GraphNode>();
	// A group is a star around its first member: walk it in both directions.
	const adjacency = new Map<string, string[]>();
	for (const e of graph.edges) {
		if (!isSameAsEdge(e)) continue;
		adjacency.set(e.source, [...(adjacency.get(e.source) ?? []), e.target]);
		adjacency.set(e.target, [...(adjacency.get(e.target) ?? []), e.source]);
	}
	const seen = new Set([key]);
	const queue = [key];
	while (queue.length) {
		const current = queue.shift() as string;
		for (const next of adjacency.get(current) ?? []) {
			if (seen.has(next)) continue;
			seen.add(next);
			queue.push(next);
			const n = nodes.get(next);
			if (n) out.set(next, n);
		}
	}
	return [...out.values()];
};

export interface NodeLinks {
	/** The object itself (asset, IOC, event…), as the backend gives it. */
	object: string | null;
	/** The node focused in its case graph. */
	caseGraph: string | null;
}

/** Where the detail panel of a node links to. Nothing for a restricted case. */
export const warRoomNodeLinks = (node: GraphNode, accessible = true): NodeLinks => {
	const parsed = parseWarRoomKey(node.key);
	if (!parsed || !accessible || node.accessible === false) return { object: null, caseGraph: null };
	if (parsed.kind === 'case') {
		return { object: node.url || `/case/${parsed.caseId}`, caseGraph: graphUrl(parsed.caseId) };
	}
	return {
		object: node.url || null,
		caseGraph: graphUrl(parsed.caseId, { focus: [parsed.localKey] })
	};
};

/** Timeline link of the events behind a case edge, null without events or for cross-case edges. */
export const warRoomEdgeEventsUrl = (edge: GraphEdge): string | null => {
	const caseId = edge.case_id ?? caseIdOfElement(edge.key);
	if (caseId === null || caseId === undefined || isSameAsEdge(edge) || !edge.event_ids?.length) {
		return null;
	}
	return timelineEventsUrl(caseId, edge.event_ids);
};

/** Keys of the nodes whose label, subtitle or type contains `query` (case-insensitive). */
export const searchWarRoomNodes = (nodes: GraphNode[], query: string): Set<string> | null => {
	const q = query.trim().toLowerCase();
	if (!q) return null;
	const out = new Set<string>();
	for (const n of nodes) {
		if (n.kind === 'case' && n.accessible === false) continue;
		const hay = [n.label, n.subtitle, n.type].filter(Boolean).join(' ').toLowerCase();
		if (hay.includes(q)) out.add(n.key);
	}
	return out;
};

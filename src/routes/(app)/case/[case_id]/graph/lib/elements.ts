import type { Position } from 'cytoscape';
import type { GraphEdge, GraphNode, GraphNodeKey } from '$lib/types/resources/case-graph';
import type {
	CyEdgeDef,
	CyElementDef,
	CyNodeDef,
	CyStylesheet
} from '$lib/components/common/CytoscapeGraph/types';
import { paletteHex, tlpHex } from '$lib/components/common/CytoscapeGraph/palette';
import { lucideIcon, svgToDataUrl } from '$lib/components/common/CytoscapeGraph/icons';
import fingerprintSvg from 'lucide-static/icons/fingerprint.svg?raw';
import {
	analysisStatusColor,
	CRITICALITY_COLOR,
	edgeLineStyle,
	edgeWidth,
	isDerivedEdge,
	isPending,
	KIND_COLOR,
	pairKey,
	truncate
} from './model';
import { nodeImage } from './icons';

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

export interface VisibilityInput {
	nodes: GraphNode[];
	edges: GraphEdge[];
	/** Explicitly hidden node keys. */
	hidden: Set<GraphNodeKey>;
	/** Assets / IOCs put on the canvas on purpose (palette, picker, creation). */
	extraNodes: Set<GraphNodeKey>;
	/** Show assets / IOCs that have no visible edge. */
	showUnlinked: boolean;
	showPending: boolean;
	showRejected: boolean;
	/** Focus mode: only nodes within `hops` of `key`. */
	focus: { key: GraphNodeKey; hops: number } | null;
	/** Extension hooks (time slider…): return false to drop an element. */
	nodeFilter?: (n: GraphNode) => boolean;
	edgeFilter?: (e: GraphEdge) => boolean;
}

export interface Visibility {
	nodes: Set<GraphNodeKey>;
	edges: Set<string>;
	/** Assets / IOCs off the canvas (hidden or unlinked) — the palette content. */
	offCanvas: Set<GraphNodeKey>;
}

const PLACEABLE = new Set(['asset', 'ioc']);

export const computeVisibility = (input: VisibilityInput): Visibility => {
	const candidates = new Set<GraphNodeKey>();
	for (const n of input.nodes) {
		if (input.hidden.has(n.key)) continue;
		if (input.nodeFilter && !input.nodeFilter(n)) continue;
		candidates.add(n.key);
	}
	const edgeOk = (e: GraphEdge) => {
		if (e.review_state === 'rejected' && !input.showRejected) return false;
		if (e.review_state === 'pending' && !input.showPending) return false;
		if (input.edgeFilter && !input.edgeFilter(e)) return false;
		return candidates.has(e.source) && candidates.has(e.target);
	};
	const candidateEdges = input.edges.filter(edgeOk);
	const linked = new Set<GraphNodeKey>();
	for (const e of candidateEdges) {
		if (e.source === e.target) continue;
		linked.add(e.source);
		linked.add(e.target);
	}

	let nodes = new Set<GraphNodeKey>();
	const offCanvas = new Set<GraphNodeKey>();
	for (const n of input.nodes) {
		const placeable = PLACEABLE.has(n.kind);
		if (!candidates.has(n.key)) {
			if (placeable && input.hidden.has(n.key)) offCanvas.add(n.key);
			continue;
		}
		if (placeable && !linked.has(n.key) && !input.showUnlinked && !input.extraNodes.has(n.key)) {
			offCanvas.add(n.key);
			continue;
		}
		nodes.add(n.key);
	}

	let edges = candidateEdges.filter((e) => nodes.has(e.source) && nodes.has(e.target));

	if (input.focus && nodes.has(input.focus.key)) {
		const adj = new Map<string, string[]>();
		for (const e of edges) {
			adj.set(e.source, [...(adj.get(e.source) ?? []), e.target]);
			adj.set(e.target, [...(adj.get(e.target) ?? []), e.source]);
		}
		const keep = new Set([input.focus.key]);
		let frontier = [input.focus.key];
		for (let h = 0; h < input.focus.hops && frontier.length; h++) {
			const next: string[] = [];
			for (const k of frontier) {
				for (const n of adj.get(k) ?? []) {
					if (!keep.has(n)) {
						keep.add(n);
						next.push(n);
					}
				}
			}
			frontier = next;
		}
		nodes = keep;
		edges = edges.filter((e) => keep.has(e.source) && keep.has(e.target));
	}

	return { nodes, edges: new Set(edges.map((e) => e.key)), offCanvas };
};

// ---------------------------------------------------------------------------
// Overlays
// ---------------------------------------------------------------------------

export interface OverlayToggles {
	compromise: boolean;
	flags: boolean;
	criticality: boolean;
	analysisStatus: boolean;
	tlp: boolean;
	enrichment: boolean;
	crossCase: boolean;
}

export const DEFAULT_OVERLAYS: OverlayToggles = {
	compromise: true,
	flags: true,
	criticality: true,
	analysisStatus: false,
	tlp: false,
	enrichment: false,
	crossCase: true
};

export const OVERLAY_LABEL: Record<keyof OverlayToggles, string> = {
	compromise: 'Compromise',
	flags: 'Flags',
	criticality: 'Criticality',
	analysisStatus: 'Analysis status',
	tlp: 'TLP',
	enrichment: 'Enrichment score',
	crossCase: 'Cross-case'
};

export interface OverlaySpec {
	/** Flag dot colours (hex), top-right, max 4 drawn. */
	flags: string[];
	/** Analysis status dot (hex), left-middle. */
	status: string | null;
	/** TLP dot (hex), bottom-left. */
	tlp: string | null;
	/** Enrichment score badge, top-left. */
	score: number | null;
	/** Cross-case count badge, bottom-right. */
	crossCase: number | null;
	isDark: boolean;
}

const esc = (s: string) => s.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Full-node SVG layer drawn over the icon (node box = 100×100). Returns null
 * when there is nothing to draw so the node keeps a single image layer.
 */
export const overlaySvg = (spec: OverlaySpec): string | null => {
	const parts: string[] = [];
	const ring = spec.isDark ? '#0f172a' : '#ffffff';
	const badgeBg = spec.isDark ? '#1e293b' : '#f8fafc';
	const badgeText = spec.isDark ? '#e2e8f0' : '#0f172a';
	const dot = (cx: number, cy: number, r: number, fill: string) =>
		`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${esc(fill)}" stroke="${ring}" stroke-width="3"/>`;

	spec.flags.slice(0, 4).forEach((c, i) => parts.push(dot(90 - i * 17, 10, 9, c)));
	if (spec.status) parts.push(dot(10, 50, 8, spec.status));
	if (spec.tlp) parts.push(dot(10, 90, 9, spec.tlp));
	if (spec.score !== null) {
		const s = Math.round(spec.score);
		const fill = s >= 70 ? '#dc2626' : s >= 40 ? '#d97706' : '#16a34a';
		parts.push(
			`<rect x="2" y="2" width="34" height="20" rx="10" fill="${fill}" stroke="${ring}" stroke-width="3"/>`,
			`<text x="19" y="17" font-size="14" font-weight="700" text-anchor="middle" fill="#ffffff" font-family="sans-serif">${s}</text>`
		);
	}
	if (spec.crossCase !== null && spec.crossCase > 0) {
		const label = spec.crossCase > 99 ? '99+' : String(spec.crossCase);
		parts.push(
			`<circle cx="88" cy="88" r="13" fill="${badgeBg}" stroke="${paletteHex('violet', spec.isDark)}" stroke-width="3"/>`,
			`<text x="88" y="93" font-size="${label.length > 2 ? 10 : 13}" font-weight="700" text-anchor="middle" fill="${badgeText}" font-family="sans-serif">${label}</text>`
		);
	}
	if (!parts.length) return null;
	return `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">${parts.join('')}</svg>`;
};

// ---------------------------------------------------------------------------
// Elements
// ---------------------------------------------------------------------------

export interface ElementsInput {
	nodes: GraphNode[];
	edges: GraphEdge[];
	visibility: Visibility;
	pinned: Set<GraphNodeKey>;
	/** Known positions — only used when a node is first added to the canvas. */
	positions: Record<GraphNodeKey, Position>;
	bundleEdges: boolean;
	expandedBundles: Set<string>;
	/** Assets with more than this many leaf IOCs are collapsed; 0 disables. */
	fanoutThreshold: number;
	expandedFanouts: Set<GraphNodeKey>;
	/** Assets whose leaf IOCs are folded whatever the threshold. */
	forcedFanouts: Set<GraphNodeKey>;
	overlays: OverlayToggles;
	isDark: boolean;
	/** Path finder highlight. */
	highlight?: { nodes: Set<string>; edges: Set<string> } | null;
	/** Search hits (null: no active search). */
	matches?: Set<GraphNodeKey> | null;
	activeMatch?: GraphNodeKey | null;
}

export interface ElementsOutput {
	elements: CyElementDef[];
	/** `fan:<assetKey>` → IOC keys folded into it. */
	fanouts: Map<string, { asset: GraphNodeKey; iocs: GraphNodeKey[] }>;
	/** `b:<pairKey>` → edge keys folded into it. */
	bundles: Map<string, string[]>;
}

export const FAN_PREFIX = 'fan:';
export const BUNDLE_PREFIX = 'b:';
export const isFanId = (id: string) => id.startsWith(FAN_PREFIX);
export const isBundleId = (id: string) => id.startsWith(BUNDLE_PREFIX);
export const fanIdOf = (assetKey: string) => `${FAN_PREFIX}${assetKey}`;
export const bundleIdOf = (a: string, b: string) => `${BUNDLE_PREFIX}${pairKey(a, b)}`;

const NODE_SIZE: Record<string, number> = {
	asset: 46,
	ioc: 36,
	node: 42,
	event: 30,
	evidence: 32,
	task: 32,
	note: 32,
	alert: 34,
	case: 40
};

const NODE_SHAPE: Record<string, string> = {
	event: 'round-diamond',
	evidence: 'round-rectangle',
	task: 'round-rectangle',
	note: 'round-rectangle',
	alert: 'round-triangle',
	case: 'round-hexagon'
};

/** IOC neighbours of each asset that have no other neighbour. */
export const leafIocs = (
	nodes: Map<GraphNodeKey, GraphNode>,
	edges: GraphEdge[]
): Map<GraphNodeKey, GraphNodeKey[]> => {
	const neighbours = new Map<string, Set<string>>();
	for (const e of edges) {
		if (e.source === e.target) continue;
		neighbours.set(e.source, (neighbours.get(e.source) ?? new Set()).add(e.target));
		neighbours.set(e.target, (neighbours.get(e.target) ?? new Set()).add(e.source));
	}
	const out = new Map<GraphNodeKey, GraphNodeKey[]>();
	for (const [key, node] of nodes) {
		if (node.kind !== 'asset') continue;
		const leaves = [...(neighbours.get(key) ?? [])].filter(
			(n) => nodes.get(n)?.kind === 'ioc' && neighbours.get(n)?.size === 1
		);
		if (leaves.length) out.set(key, leaves.sort());
	}
	return out;
};

/**
 * Asset → IOC leaves that fold into a fan-out badge: more than `threshold`
 * leaves (0 disables the automatic folding), or any leaf when the asset is
 * in `forced`. `expanded` assets never fold.
 */
export const fanoutCandidates = (
	nodes: Map<GraphNodeKey, GraphNode>,
	edges: GraphEdge[],
	threshold: number,
	expanded: Set<GraphNodeKey>,
	forced: Set<GraphNodeKey> = new Set()
): Map<GraphNodeKey, GraphNodeKey[]> => {
	const out = new Map<GraphNodeKey, GraphNodeKey[]>();
	for (const [asset, leaves] of leafIocs(nodes, edges)) {
		if (expanded.has(asset)) continue;
		if (forced.has(asset) || (threshold > 0 && leaves.length > threshold)) out.set(asset, leaves);
	}
	return out;
};

const nodeDef = (n: GraphNode, input: ElementsInput, classes: string[]): CyNodeDef => {
	const { isDark, overlays } = input;
	const kindColor = paletteHex(
		n.kind === 'node' ? (n.color ?? KIND_COLOR.node) : KIND_COLOR[n.kind],
		isDark
	);
	const compromised = overlays.compromise && n.compromised === true;
	const border = compromised ? paletteHex('red', isDark) : kindColor;
	const image = nodeImage(n, kindColor, isDark);
	const crit = overlays.criticality
		? CRITICALITY_COLOR[(n.criticality ?? '').toLowerCase()]
		: undefined;
	const statusColor = overlays.analysisStatus ? analysisStatusColor(n.analysis_status) : null;
	const score = n.enrichment?.score;
	const overlay = overlaySvg({
		flags: overlays.flags ? (n.flags ?? []).map((f) => paletteHex(f.color, isDark)) : [],
		status: statusColor ? paletteHex(statusColor, isDark) : null,
		tlp: overlays.tlp ? tlpHex(n.tlp, isDark) : null,
		score: overlays.enrichment && typeof score === 'number' ? score : null,
		crossCase: overlays.crossCase ? (n.cross_case_count ?? null) : null,
		isDark
	});

	const data: CyNodeDef['data'] = {
		id: n.key,
		kind: n.kind,
		label: truncate(n.label ?? n.key, 30),
		fullLabel: n.label ?? n.key,
		color: border,
		images: overlay ? [image.url, svgToDataUrl(overlay)] : [image.url],
		iconScale: image.scale,
		size: NODE_SIZE[n.kind] ?? 36,
		shape:
			NODE_SHAPE[n.kind] ??
			(n.kind === 'node' && n.type === 'note' ? 'round-rectangle' : 'ellipse'),
		borderWidth: compromised ? 4 : 2
	};
	if (compromised) data.bg = isDark ? '#450a0a' : '#fef2f2';
	if (crit) {
		data.outlineColor = paletteHex(crit, isDark);
		data.outlineWidth = 3;
	}
	if (n.kind === 'case' && n.accessible === false) data.borderStyle = 'dashed';
	return {
		group: 'nodes',
		data,
		classes,
		position: input.positions[n.key]
	};
};

const edgeColor = (e: GraphEdge, isDark: boolean) =>
	isPending(e) ? paletteHex('amber', isDark) : paletteHex(e.relation?.color, isDark);

export const buildElements = (input: ElementsInput): ElementsOutput => {
	const { visibility, isDark } = input;
	const nodeMap = new Map<GraphNodeKey, GraphNode>();
	for (const n of input.nodes) if (visibility.nodes.has(n.key)) nodeMap.set(n.key, n);
	const edges = input.edges.filter((e) => visibility.edges.has(e.key));

	const highlight = input.highlight ?? null;
	const matches = input.matches ?? null;
	const nodeClasses = (key: string, base: string[]) => {
		const cls = [...base];
		if (input.pinned.has(key)) cls.push('pinned');
		if (highlight) cls.push(highlight.nodes.has(key) ? 'highlighted' : 'dimmed');
		else if (matches) cls.push(matches.has(key) ? 'search-hit' : 'dimmed');
		if (input.activeMatch === key) cls.push('active-match');
		return cls;
	};
	const edgeDimmed = (source: string, target: string, keys: string[]) => {
		if (highlight) return !keys.some((k) => highlight.edges.has(k));
		if (matches) return !(matches.has(source) && matches.has(target));
		return false;
	};

	// Fan-outs
	const folded = fanoutCandidates(
		nodeMap,
		edges,
		input.fanoutThreshold,
		input.expandedFanouts,
		input.forcedFanouts
	);
	const foldedIoc = new Map<string, string>();
	const fanouts: ElementsOutput['fanouts'] = new Map();
	for (const [asset, iocs] of folded) {
		const id = fanIdOf(asset);
		fanouts.set(id, { asset, iocs });
		for (const i of iocs) foldedIoc.set(i, id);
	}

	const elements: CyElementDef[] = [];
	for (const n of nodeMap.values()) {
		if (foldedIoc.has(n.key)) continue;
		elements.push(nodeDef(n, input, nodeClasses(n.key, [`kind-${n.kind}`])));
	}

	const iocColor = paletteHex(KIND_COLOR.ioc, isDark);
	for (const [id, { asset, iocs }] of fanouts) {
		const anyMatch = matches ? iocs.some((i) => matches.has(i)) : false;
		const cls = ['fanout'];
		if (highlight) cls.push(iocs.some((i) => highlight.nodes.has(i)) ? 'highlighted' : 'dimmed');
		else if (matches) cls.push(anyMatch ? 'search-hit' : 'dimmed');
		elements.push({
			group: 'nodes',
			data: {
				id,
				kind: 'fanout',
				label: `${iocs.length} IOCs`,
				fullLabel: `${iocs.length} IOCs linked only to this asset`,
				color: iocColor,
				images: [lucideIcon(fingerprintSvg, iocColor)],
				iconScale: 0.5,
				size: 34,
				shape: 'round-rectangle',
				borderStyle: 'dashed',
				members: iocs
			},
			classes: cls,
			position: input.positions[id]
		});
		const fanEdgeKeys = edges
			.filter((e) => iocs.includes(e.source) || iocs.includes(e.target))
			.map((e) => e.key);
		elements.push({
			group: 'edges',
			data: {
				id: `${id}>`,
				source: asset,
				target: id,
				label: `${iocs.length}`,
				color: iocColor,
				width: edgeWidth(iocs.length),
				lineStyle: 'dashed',
				arrow: 'none',
				members: fanEdgeKeys
			},
			classes: ['fanout-edge', ...(edgeDimmed(asset, id, fanEdgeKeys) ? ['dimmed'] : [])]
		});
	}

	// Edges, bundled per node pair.
	const byPair = new Map<string, GraphEdge[]>();
	for (const e of edges) {
		if (foldedIoc.has(e.source) || foldedIoc.has(e.target)) continue;
		const pk = pairKey(e.source, e.target);
		byPair.set(pk, [...(byPair.get(pk) ?? []), e]);
	}
	const bundles: ElementsOutput['bundles'] = new Map();
	for (const group of byPair.values()) {
		const first = group[0];
		const bundleId = bundleIdOf(first.source, first.target);
		if (input.bundleEdges && group.length > 1 && !input.expandedBundles.has(bundleId)) {
			const keys = group.map((e) => e.key);
			bundles.set(bundleId, keys);
			const colors = new Set(group.map((e) => edgeColor(e, isDark)));
			const total = group.reduce((s, e) => s + Math.max(1, e.count ?? 1), 0);
			const def: CyEdgeDef = {
				group: 'edges',
				data: {
					id: bundleId,
					source: first.source,
					target: first.target,
					label: `${group.length} relations`,
					width: edgeWidth(total),
					lineStyle: group.every(isDerivedEdge) ? 'dashed' : 'solid',
					arrow: 'none',
					members: keys,
					...(colors.size === 1 ? { color: [...colors][0] } : {})
				},
				classes: ['bundle']
			};
			if (highlight && keys.some((k) => highlight.edges.has(k))) def.classes?.push('highlighted');
			else if (edgeDimmed(first.source, first.target, keys)) def.classes?.push('dimmed');
			elements.push(def);
			continue;
		}
		for (const e of group) {
			const cls = [isDerivedEdge(e) ? 'derived' : 'stored'];
			if (isPending(e)) cls.push('pending');
			if (e.review_state === 'rejected') cls.push('rejected');
			if (highlight?.edges.has(e.key)) cls.push('highlighted');
			else if (edgeDimmed(e.source, e.target, [e.key])) cls.push('dimmed');
			elements.push({
				group: 'edges',
				data: {
					id: e.key,
					source: e.source,
					target: e.target,
					label: e.label || e.relation?.label || e.relation?.name || '',
					color: edgeColor(e, isDark),
					width: edgeWidth(e.count),
					lineStyle: edgeLineStyle(e),
					arrow: e.directed ? 'triangle' : 'none'
				},
				classes: cls
			});
		}
	}

	return { elements, fanouts, bundles };
};

/** Extra stylesheet rules of the case graph on top of the CytoscapeGraph defaults. */
export const caseGraphStylesheet = (isDark: boolean): CyStylesheet => [
	{
		selector: 'node.search-hit',
		style: {
			'underlay-color': paletteHex('amber', isDark),
			'underlay-opacity': 0.35,
			'underlay-padding': 6
		}
	},
	{
		selector: 'node.active-match',
		style: {
			'underlay-color': paletteHex('amber', isDark),
			'underlay-opacity': 0.6,
			'underlay-padding': 9
		}
	},
	{
		selector: 'edge.pending',
		style: { 'line-dash-pattern': [2, 4] }
	},
	{
		selector: 'edge.rejected',
		style: { opacity: 0.35 }
	},
	{
		selector: 'node.fanout',
		style: { 'font-weight': 'bold' }
	}
];

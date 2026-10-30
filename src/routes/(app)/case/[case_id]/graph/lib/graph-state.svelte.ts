import { getContext, setContext, untrack, type Component } from 'svelte';
import type { Core, Position } from 'cytoscape';
import type { Icon } from 'lucide-svelte';
import type {
	CaseGraph,
	CreateFreeNodeBody,
	CreateGraphEdgeBody,
	GraphEdge,
	GraphInclude,
	GraphNode,
	GraphNodeKey,
	GraphPasteBody,
	GraphPasteResult,
	GraphPathsResult,
	GraphReviewDecision,
	GraphViewState,
	PromoteFreeNodeBody,
	UpdateFreeNodeBody,
	UpdateGraphEdgeBody
} from '$lib/types/resources/case-graph';
import type { RequestResponse } from '$lib/services/api.service';
import { CaseGraphService } from '$lib/services/case-graph.service';
import { CaseAssetsService } from '$lib/services/case-assets.service';
import { CaseIocsService } from '$lib/services/case-iocs.service';
import { AssetFlagsService } from '$lib/services/asset-flags.service';
import { CaseTasksService } from '$lib/services/case-tasks.service';
import { apiErrorMessage } from '$lib/utils/error-handler';
import {
	runLayout,
	type CyLayoutName,
	type Positions
} from '$lib/components/common/CytoscapeGraph/layouts';
import {
	buildIndex,
	isStoredEdge,
	mergeByKey,
	parseNodeKey,
	toTime,
	type GraphIndex
} from './model';
import {
	buildElements,
	computeVisibility,
	DEFAULT_OVERLAYS,
	leafIocs,
	type ElementsOutput,
	type OverlayToggles,
	type Visibility
} from './elements';
import { groupOf, type GroupingMode } from './grouping';
import { cycleIndex, searchNodes } from './search';
import { OperationHistory } from './history';
import { KeyMap, KeySet } from './reactive-collections.svelte';
import {
	emptyViewState,
	loadLocalViewState,
	parseViewState,
	saveLocalViewState
} from './view-state';

// ---------------------------------------------------------------------------
// Extension points
// ---------------------------------------------------------------------------

/** A side panel shown as a tab of the right rail (suggestions, gaps, views…). */
export interface GraphPanel {
	id: string;
	title: string;
	icon?: Component<{ class?: string }> | typeof Icon;
	component: Component<{ graph: CaseGraphState }>;
	order?: number;
}

/** A toolbar control (time slider, view menu, export…). */
export interface GraphToolbarItem {
	id: string;
	component: Component<{ graph: CaseGraphState }>;
	/** `start` sits after the search box, `end` before the refresh button. */
	slot?: 'start' | 'end';
	order?: number;
}

/** A visibility filter contributed by a feature (time window, table selection…). */
export interface GraphFilterHook {
	node?: (n: GraphNode) => boolean;
	edge?: (e: GraphEdge) => boolean;
}

/** Overlay drawn above the canvas (presence cursors, time scrubber…). */
export interface GraphCanvasOverlay {
	id: string;
	component: Component<{ graph: CaseGraphState }>;
}

export type LayoutChoice =
	| 'fcose'
	| 'dagre'
	| 'chronological'
	| 'radial'
	| 'grid'
	| `grouped:${GroupingMode}`;

export type RailTarget =
	| { type: 'node'; key: GraphNodeKey }
	| { type: 'edge'; key: string }
	| { type: 'bundle'; id: string }
	| { type: 'fanout'; id: string }
	| { type: 'selection' }
	| { type: 'paths' }
	| { type: 'panel'; id: string };

export interface PathFinderState {
	source: GraphNodeKey | null;
	target: GraphNodeKey | null;
	directed: boolean;
	maxLength: number;
	result: GraphPathsResult | null;
	active: number;
	loading: boolean;
	error: string | null;
}

export class GraphApiError extends Error {}

/** Unwrap a service response or throw with the backend message. */
export const unwrap = <T>(res: RequestResponse<T>, fallback: string): T => {
	if (!res.ok) throw new GraphApiError(apiErrorMessage(res, fallback));
	return res.data as T;
};

const DEFAULT_FANOUT = 8;

/**
 * State of one case graph page. Holds the server graph, all presentation
 * state (persisted in the view state), the API operations with undo / redo,
 * and the extension registries other features plug into.
 */
export class CaseGraphState {
	readonly caseId: number;

	// Data
	graph = $state.raw<CaseGraph | null>(null);
	expansion = $state.raw<{ nodes: GraphNode[]; edges: GraphEdge[] }>({ nodes: [], edges: [] });
	loading = $state(false);
	refreshing = $state(false);
	error = $state<string | null>(null);
	include = $state<GraphInclude[]>([]);

	// Presentation (persisted)
	hidden = new KeySet<GraphNodeKey>();
	pinned = new KeySet<GraphNodeKey>();
	extraNodes = new KeySet<GraphNodeKey>();
	expandedFanouts = new KeySet<GraphNodeKey>();
	forcedFanouts = new KeySet<GraphNodeKey>();
	expandedBundles = new KeySet<string>();
	layout = $state<LayoutChoice>('fcose');
	locked = $state(false);
	overlays = $state<OverlayToggles>({ ...DEFAULT_OVERLAYS });
	fanoutThreshold = $state(DEFAULT_FANOUT);
	bundleEdges = $state(true);
	showUnlinked = $state(false);
	showPending = $state(true);
	showRejected = $state(false);
	showMinimap = $state(true);
	viewport = $state.raw<GraphViewState['viewport']>(null);
	/** Time window owned by the time slider extension; persisted as is. */
	time = $state.raw<GraphViewState['time']>(null);
	/** Last known node positions (model coordinates). Not reactive on purpose. */
	positions: Record<GraphNodeKey, Position> = {};
	/** View-state keys owned by other features, round-tripped untouched. */
	private foreignState: Record<string, unknown> = {};

	// Exploration
	query = $state('');
	activeMatchIndex = $state(-1);
	focus = $state<{ key: GraphNodeKey; hops: number } | null>(null);
	path = $state<PathFinderState>({
		source: null,
		target: null,
		directed: false,
		maxLength: 8,
		result: null,
		active: 0,
		loading: false,
		error: null
	});
	selection = $state.raw<string[]>([]);
	rail = $state<RailTarget | null>(null);
	/**
	 * Transient highlight set by features (suggestion hover, gap, deep link);
	 * wins over the path finder highlight while set.
	 */
	preview = $state.raw<{ nodes: Set<string>; edges: Set<string> } | null>(null);
	/** Canvas, or the nodes / edges table over it (the canvas stays mounted). */
	viewMode = $state<'canvas' | 'table'>('canvas');
	/** Neighbourhood expansions to replay on refresh. */
	expanded = new KeyMap<GraphNodeKey, number>();

	// Canvas
	cy = $state.raw<Core | null>(null);
	isDark = $state(false);
	layoutRunning = $state(false);

	// Extension registries
	panels = new KeyMap<string, GraphPanel>();
	toolbarItems = new KeyMap<string, GraphToolbarItem>();
	filters = new KeyMap<string, GraphFilterHook>();
	canvasOverlays = new KeyMap<string, GraphCanvasOverlay>();

	// History
	private historyVersion = $state(0);
	readonly history = new OperationHistory(100, () => this.historyVersion++);
	private edgeAlias = new Map<number, number>();
	private keyAlias = new Map<string, string>();

	private autosaveTimer: ReturnType<typeof setTimeout> | undefined;
	/** Bumped on every presentation change (saved-view dirty tracking). */
	stateVersion = $state(0);
	private loadSeq = 0;

	constructor(caseId: number) {
		this.caseId = caseId;
	}

	// -----------------------------------------------------------------------
	// Derived data
	// -----------------------------------------------------------------------

	nodes = $derived<GraphNode[]>(mergeByKey(this.graph?.nodes ?? [], this.expansion.nodes));
	edges = $derived<GraphEdge[]>(mergeByKey(this.graph?.edges ?? [], this.expansion.edges));
	index = $derived<GraphIndex>(buildIndex(this.nodes, this.edges));
	relationTypes = $derived(
		[...(this.graph?.relation_types ?? [])].sort(
			(a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)
		)
	);
	eventsById = $derived(new Map((this.graph?.events ?? []).map((e) => [e.event_id, e])));

	visibility = $derived<Visibility>(
		computeVisibility({
			nodes: this.nodes,
			edges: this.edges,
			hidden: this.hidden,
			extraNodes: this.extraNodes,
			showUnlinked: this.showUnlinked,
			showPending: this.showPending,
			showRejected: this.showRejected,
			focus: this.focus,
			nodeFilter: this.nodeFilter,
			edgeFilter: this.edgeFilter
		})
	);

	/** Search hits among the visible nodes, in a stable order (label). */
	matches = $derived.by<GraphNodeKey[] | null>(() => {
		const visible = this.nodes
			.filter((n) => this.visibility.nodes.has(n.key))
			.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''));
		return searchNodes(visible, this.query);
	});

	activeMatch = $derived(
		this.matches && this.activeMatchIndex >= 0
			? (this.matches[this.activeMatchIndex] ?? null)
			: null
	);

	highlight = $derived.by(() => {
		if (this.preview) return this.preview;
		const r = this.path.result;
		if (!r || !r.paths.length) return null;
		const p = r.paths[Math.min(this.path.active, r.paths.length - 1)];
		return { nodes: new Set(p.node_keys), edges: new Set(p.edge_keys) };
	});

	output = $derived.by<ElementsOutput>(() =>
		buildElements({
			nodes: this.nodes,
			edges: this.edges,
			visibility: this.visibility,
			pinned: this.pinned,
			positions: untrack(() => this.positions),
			bundleEdges: this.bundleEdges,
			expandedBundles: this.expandedBundles,
			fanoutThreshold: this.fanoutThreshold,
			expandedFanouts: this.expandedFanouts,
			forcedFanouts: this.forcedFanouts,
			overlays: this.overlays,
			isDark: this.isDark,
			highlight: this.highlight,
			matches: this.matches ? new Set(this.matches) : null,
			activeMatch: this.activeMatch
		})
	);

	/** Assets / IOCs available in the palette (not on the canvas). */
	offCanvas = $derived(this.nodes.filter((n) => this.visibility.offCanvas.has(n.key)));

	canUndo = $derived.by(() => (this.historyVersion, this.history.canUndo));
	canRedo = $derived.by(() => (this.historyVersion, this.history.canRedo));
	undoLabel = $derived.by(() => (this.historyVersion, this.history.undoLabel));
	redoLabel = $derived.by(() => (this.historyVersion, this.history.redoLabel));

	private get nodeFilter() {
		const hooks = [...this.filters.values()].map((f) => f.node).filter((f) => !!f);
		return hooks.length ? (n: GraphNode) => hooks.every((h) => h(n)) : undefined;
	}

	private get edgeFilter() {
		const hooks = [...this.filters.values()].map((f) => f.edge).filter((f) => !!f);
		return hooks.length ? (e: GraphEdge) => hooks.every((h) => h(e)) : undefined;
	}

	node(key: GraphNodeKey | null | undefined): GraphNode | undefined {
		return key ? this.index.nodes.get(key) : undefined;
	}

	edge(key: string | null | undefined): GraphEdge | undefined {
		return key ? this.index.edges.get(key) : undefined;
	}

	isVisible(key: GraphNodeKey) {
		return this.visibility.nodes.has(key);
	}

	// -----------------------------------------------------------------------
	// Extension registration (returns an unregister function)
	// -----------------------------------------------------------------------

	registerPanel(panel: GraphPanel) {
		this.panels.set(panel.id, panel);
		return () => this.panels.delete(panel.id);
	}

	registerToolbarItem(item: GraphToolbarItem) {
		this.toolbarItems.set(item.id, item);
		return () => this.toolbarItems.delete(item.id);
	}

	registerFilter(id: string, hook: GraphFilterHook) {
		this.filters.set(id, hook);
		return () => this.filters.delete(id);
	}

	registerCanvasOverlay(overlay: GraphCanvasOverlay) {
		this.canvasOverlays.set(overlay.id, overlay);
		return () => this.canvasOverlays.delete(overlay.id);
	}

	// -----------------------------------------------------------------------
	// Loading
	// -----------------------------------------------------------------------

	async load({ silent = false }: { silent?: boolean } = {}) {
		const seq = ++this.loadSeq;
		if (silent && this.graph) this.refreshing = true;
		else this.loading = true;
		try {
			const res = await CaseGraphService.get(this.caseId, {
				include: this.include,
				review_state: 'all'
			});
			if (seq !== this.loadSeq) return;
			if (!res.ok || !res.data || typeof res.data !== 'object') {
				this.error = apiErrorMessage(res, 'Could not load the case graph.');
				return;
			}
			this.graph = res.data as CaseGraph;
			this.error = null;
			await this.replayExpansions(seq);
		} catch (e) {
			if (seq === this.loadSeq) {
				this.error = e instanceof Error ? e.message : 'Could not load the case graph.';
			}
		} finally {
			if (seq === this.loadSeq) {
				this.loading = false;
				this.refreshing = false;
			}
		}
	}

	refresh() {
		return this.load({ silent: true });
	}

	setInclude(include: GraphInclude[]) {
		this.include = [...include];
		this.markDirty();
		return this.load({ silent: true });
	}

	private async replayExpansions(seq: number) {
		if (!this.expanded.size) {
			this.expansion = { nodes: [], edges: [] };
			return;
		}
		const results = await Promise.all(
			[...this.expanded].map(([key, hops]) => CaseGraphService.neighbours(this.caseId, key, hops))
		);
		if (seq !== this.loadSeq) return;
		const nodes: GraphNode[] = [];
		const edges: GraphEdge[] = [];
		for (const r of results) {
			if (r.ok && r.data && typeof r.data === 'object') {
				nodes.push(...(r.data.nodes ?? []));
				edges.push(...(r.data.edges ?? []));
			}
		}
		this.expansion = { nodes: mergeByKey(nodes), edges: mergeByKey(edges) };
	}

	// -----------------------------------------------------------------------
	// View state
	// -----------------------------------------------------------------------

	toViewState(): GraphViewState {
		const positions: GraphViewState['positions'] = { ...this.positions };
		this.cy?.nodes().forEach((n) => {
			positions[n.id()] = { ...n.position() };
		});
		return {
			...this.foreignState,
			layout: this.layout,
			positions,
			pinned: [...this.pinned],
			hidden: [...this.hidden],
			collapsed: [...this.forcedFanouts],
			filters: {
				overlays: { ...this.overlays },
				fanout_threshold: this.fanoutThreshold,
				expanded_fanouts: [...this.expandedFanouts],
				bundle_edges: this.bundleEdges,
				show_unlinked: this.showUnlinked,
				show_pending: this.showPending,
				show_rejected: this.showRejected,
				locked: this.locked,
				query: this.query,
				minimap: this.showMinimap
			},
			viewport: this.cy ? { zoom: this.cy.zoom(), pan: { ...this.cy.pan() } } : this.viewport,
			time: this.time,
			include: [...this.include],
			extra_nodes: [...this.extraNodes]
		};
	}

	/**
	 * Apply a view state. Positions of nodes already on the canvas are moved
	 * (no rebuild); `reload` refetches when `include` changed.
	 */
	async applyViewState(raw: unknown, { reload = true }: { reload?: boolean } = {}) {
		const state = parseViewState(raw);
		const {
			layout,
			positions,
			pinned,
			hidden,
			collapsed,
			filters,
			viewport,
			time,
			include,
			extra_nodes,
			...foreign
		} = state;
		this.foreignState = foreign;
		const f = filters as Record<string, unknown>;
		const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
		const LAYOUTS = ['fcose', 'dagre', 'chronological', 'radial', 'grid'];
		this.layout =
			layout &&
			(LAYOUTS.includes(layout) || /^grouped:(type|compromise|subnet|domain)$/.test(layout))
				? (layout as LayoutChoice)
				: 'fcose';
		this.positions = { ...positions };
		this.pinned.replace(pinned);
		this.hidden.replace(hidden);
		this.forcedFanouts.replace(collapsed);
		this.extraNodes.replace(extra_nodes ?? []);
		this.expandedFanouts.replace(
			Array.isArray(f.expanded_fanouts)
				? f.expanded_fanouts.filter((k): k is string => typeof k === 'string')
				: []
		);
		const ov = (f.overlays ?? {}) as Partial<Record<keyof OverlayToggles, unknown>>;
		this.overlays = Object.fromEntries(
			Object.entries(DEFAULT_OVERLAYS).map(([k, d]) => [k, bool(ov[k as keyof OverlayToggles], d)])
		) as unknown as OverlayToggles;
		this.fanoutThreshold =
			typeof f.fanout_threshold === 'number' && f.fanout_threshold >= 0
				? Math.floor(f.fanout_threshold)
				: DEFAULT_FANOUT;
		this.bundleEdges = bool(f.bundle_edges, true);
		this.showUnlinked = bool(f.show_unlinked, false);
		this.showPending = bool(f.show_pending, true);
		this.showRejected = bool(f.show_rejected, false);
		this.locked = bool(f.locked, false);
		this.showMinimap = bool(f.minimap, true);
		this.query = typeof f.query === 'string' ? f.query : '';
		this.viewport = viewport;
		this.time = time;

		const cy = this.cy;
		if (cy) {
			cy.batch(() => {
				for (const [k, p] of Object.entries(positions)) {
					const n = cy.getElementById(k);
					if (n.nonempty()) n.position(p);
				}
			});
			if (viewport) cy.viewport({ zoom: viewport.zoom, pan: viewport.pan });
			cy.autolock(this.locked);
		}

		const includeChanged =
			include.length !== this.include.length || include.some((i) => !this.include.includes(i));
		this.include = include;
		if (reload && includeChanged) await this.load({ silent: true });
		this.markDirty();
	}

	/** Restore the autosaved state of this case (call before the first load). */
	restoreLocal() {
		const saved = loadLocalViewState(this.caseId);
		if (saved) void this.applyViewState(saved, { reload: false });
		return !!saved;
	}

	/** Debounced autosave to localStorage. */
	markDirty() {
		this.stateVersion = untrack(() => this.stateVersion) + 1;
		clearTimeout(this.autosaveTimer);
		this.autosaveTimer = setTimeout(() => this.saveNow(), 800);
	}

	saveNow() {
		clearTimeout(this.autosaveTimer);
		saveLocalViewState(this.caseId, this.toViewState());
	}

	resetView() {
		void this.applyViewState(emptyViewState(), { reload: false });
		this.positions = {};
		this.expanded.clear();
		this.expansion = { nodes: [], edges: [] };
		this.focus = null;
		this.clearPath();
	}

	dispose() {
		this.saveNow();
		clearTimeout(this.autosaveTimer);
	}

	// -----------------------------------------------------------------------
	// Canvas helpers
	// -----------------------------------------------------------------------

	recordPositions(positions: Positions) {
		Object.assign(this.positions, positions);
		this.markDirty();
	}

	/** Position used when `key` first appears on the canvas. */
	placeAt(key: GraphNodeKey, p: Position | null | undefined) {
		if (p) this.positions[key] = { x: p.x, y: p.y };
		const n = this.cy?.getElementById(key);
		if (p && n && n.nonempty()) n.position(p);
	}

	async applyLayout(choice: LayoutChoice = this.layout, opts: { onlyNodes?: string[] } = {}) {
		const cy = this.cy;
		if (!cy || this.locked) return;
		this.layout = choice;
		const [name, mode] = choice.split(':') as [string, GroupingMode | undefined];
		const nodes = opts.onlyNodes?.length ? this.collectionOf(opts.onlyNodes) : undefined;
		this.layoutRunning = true;
		try {
			const centerSel = this.selection.find((id) => cy.getElementById(id).isNode?.());
			const positions = await runLayout(cy, name as CyLayoutName, {
				nodes,
				pinned: new Set(this.pinned),
				centerId: centerSel ?? (this.rail?.type === 'node' ? this.rail.key : undefined),
				timeOf: (id) => {
					const n = this.node(id);
					return toTime(n?.first_seen) ?? this.fanTime(id);
				},
				groupOf: (id) => {
					const n = this.node(id);
					if (n && mode) return groupOf(n, mode);
					const fan = this.output.fanouts.get(id);
					const asset = fan ? this.node(fan.asset) : undefined;
					return asset && mode ? groupOf(asset, mode) : 'Other';
				}
			});
			this.recordPositions(positions);
		} finally {
			this.layoutRunning = false;
		}
	}

	private fanTime(id: string): number | null {
		const fan = this.output.fanouts.get(id);
		if (!fan) return null;
		const times = fan.iocs.map((k) => toTime(this.node(k)?.first_seen)).filter((t) => t !== null);
		return times.length ? Math.min(...(times as number[])) : null;
	}

	private collectionOf(ids: string[]) {
		const cy = this.cy as Core;
		let out = cy.collection();
		for (const id of ids) out = out.union(cy.getElementById(id));
		return out;
	}

	setLocked(locked: boolean) {
		this.locked = locked;
		this.cy?.autolock(locked);
		this.markDirty();
	}

	fit(keys?: string[]) {
		const cy = this.cy;
		if (!cy) return;
		const eles = keys?.length ? this.collectionOf(keys) : cy.elements(':visible');
		if (eles.nonempty()) cy.animate({ fit: { eles, padding: 60 }, duration: 250 });
	}

	centerOn(key: string) {
		const cy = this.cy;
		const n = cy?.getElementById(key);
		if (!cy || !n || n.empty()) return;
		cy.animate({ center: { eles: n }, duration: 250 });
	}

	select(ids: string[], { center = false }: { center?: boolean } = {}) {
		const cy = this.cy;
		if (!cy) return;
		cy.batch(() => {
			cy.$(':selected').unselect();
			for (const id of ids) cy.getElementById(id).select();
		});
		if (center && ids.length === 1) this.centerOn(ids[0]);
	}

	/** Canvas id of a node key (folded IOCs live in their fan-out node). */
	canvasIdOf(key: string): string | null {
		if (this.cy?.getElementById(key).nonempty()) return key;
		for (const [id, fan] of this.output.fanouts) if (fan.iocs.includes(key)) return id;
		return null;
	}

	// -----------------------------------------------------------------------
	// Local (non-API) operations
	// -----------------------------------------------------------------------

	hide(keys: string[]) {
		for (const key of keys) {
			const fan = this.output.fanouts.get(key);
			if (fan) fan.iocs.forEach((k) => this.hidden.add(k));
			else this.hidden.add(key);
			this.extraNodes.delete(key);
		}
		if (this.rail?.type === 'node' && keys.includes(this.rail.key)) this.rail = null;
		if (this.focus && keys.includes(this.focus.key)) this.focus = null;
		this.markDirty();
	}

	unhide(keys: string[]) {
		keys.forEach((k) => this.hidden.delete(k));
		this.markDirty();
	}

	unhideAll() {
		this.hidden.clear();
		this.markDirty();
	}

	/** Put assets / IOCs on the canvas (palette drop, picker, creation). */
	addToCanvas(keys: string[], at?: Position | null) {
		keys.forEach((k, i) => {
			this.hidden.delete(k);
			this.extraNodes.add(k);
			if (at) this.placeAt(k, { x: at.x + (i % 6) * 70, y: at.y + Math.floor(i / 6) * 70 });
		});
		this.markDirty();
	}

	togglePin(keys: string[], pin?: boolean) {
		const target = pin ?? keys.some((k) => !this.pinned.has(k));
		for (const k of keys) {
			if (target) this.pinned.add(k);
			else this.pinned.delete(k);
		}
		this.markDirty();
	}

	setFocus(key: GraphNodeKey | null, hops = this.focus?.hops ?? 1) {
		this.focus = key ? { key, hops: Math.max(1, Math.min(6, hops)) } : null;
	}

	toggleFanout(assetKey: GraphNodeKey) {
		const id = `fan:${assetKey}`;
		if (this.output.fanouts.has(id)) {
			this.expandedFanouts.add(assetKey);
			this.forcedFanouts.delete(assetKey);
		} else {
			this.expandedFanouts.delete(assetKey);
			this.forcedFanouts.add(assetKey);
		}
		this.markDirty();
	}

	/** Number of IOC leaves an asset could fold. */
	leafIocCount(assetKey: GraphNodeKey): number {
		const nodes = new Map(
			this.nodes.filter((n) => this.visibility.nodes.has(n.key)).map((n) => [n.key, n])
		);
		const edges = this.edges.filter((e) => this.visibility.edges.has(e.key));
		return leafIocs(nodes, edges).get(assetKey)?.length ?? 0;
	}

	toggleBundle(bundleId: string) {
		if (this.expandedBundles.has(bundleId)) this.expandedBundles.delete(bundleId);
		else this.expandedBundles.add(bundleId);
	}

	setQuery(q: string) {
		this.query = q;
		this.activeMatchIndex = -1;
		this.markDirty();
	}

	/** Enter / Shift+Enter in the search box. Returns the canvas id to focus. */
	cycleMatch(backwards = false): string | null {
		const m = this.matches;
		if (!m?.length) return null;
		this.activeMatchIndex = cycleIndex(this.activeMatchIndex, m.length, backwards);
		const key = m[this.activeMatchIndex];
		const id = this.canvasIdOf(key);
		if (id) {
			this.select([id]);
			this.centerOn(id);
		}
		return key;
	}

	/** Expand neighbours through the API (also brings in kinds not included). */
	async expand(key: GraphNodeKey, hops = 1) {
		const res = await CaseGraphService.neighbours(this.caseId, key, hops);
		const subset = unwrap(res, 'Could not load the neighbours.');
		this.expanded.set(key, Math.max(hops, this.expanded.get(key) ?? 0));
		this.expansion = {
			nodes: mergeByKey(this.expansion.nodes, subset.nodes ?? []),
			edges: mergeByKey(this.expansion.edges, subset.edges ?? [])
		};
		const keys = (subset.nodes ?? []).map((n) => n.key);
		keys.forEach((k) => {
			this.hidden.delete(k);
			if (k !== key) this.extraNodes.add(k);
		});
		if (this.output.fanouts.has(`fan:${key}`)) this.toggleFanout(key);
		this.markDirty();
		return keys.length;
	}

	/** Hide the neighbours that only hang off `key`. */
	collapse(key: GraphNodeKey) {
		const neighbours = this.index.adjacency.get(key) ?? new Set();
		const leaves = [...neighbours].filter((n) => {
			if (!this.visibility.nodes.has(n)) return false;
			const other = [...(this.index.adjacency.get(n) ?? [])].filter(
				(m) => m !== key && this.visibility.nodes.has(m)
			);
			return other.length === 0;
		});
		this.expanded.delete(key);
		this.hide(leaves);
		return leaves.length;
	}

	// -----------------------------------------------------------------------
	// Path finder
	// -----------------------------------------------------------------------

	async findPaths() {
		const { source, target, directed, maxLength } = this.path;
		if (!source || !target || source === target) return;
		this.path.loading = true;
		this.path.error = null;
		try {
			const res = await CaseGraphService.paths(this.caseId, {
				source,
				target,
				directed,
				max_paths: 5,
				max_length: maxLength
			});
			const result = unwrap(res, 'Could not compute the paths.');
			this.path.result = result;
			this.path.active = 0;
			// Path members must be on the canvas to be highlighted.
			const keys = new Set(result.paths.flatMap((p) => p.node_keys));
			keys.forEach((k) => this.hidden.delete(k));
			keys.forEach((k) => {
				const n = this.node(k);
				if (n && (n.kind === 'asset' || n.kind === 'ioc')) this.extraNodes.add(k);
			});
			for (const k of keys) {
				const fan = [...this.output.fanouts.values()].find((f) => f.iocs.includes(k));
				if (fan) this.expandedFanouts.add(fan.asset);
			}
		} catch (e) {
			this.path.error = e instanceof Error ? e.message : 'Could not compute the paths.';
			this.path.result = null;
		} finally {
			this.path.loading = false;
		}
	}

	clearPath() {
		this.path.result = null;
		this.path.error = null;
		this.path.active = 0;
	}

	// -----------------------------------------------------------------------
	// API operations (undoable)
	// -----------------------------------------------------------------------

	private resolveEdgeId(id: number): number {
		let cur = id;
		const seen = new Set<number>();
		while (this.edgeAlias.has(cur) && !seen.has(cur)) {
			seen.add(cur);
			cur = this.edgeAlias.get(cur) as number;
		}
		return cur;
	}

	resolveKey(key: string): string {
		let cur = key;
		const seen = new Set<string>();
		while (this.keyAlias.has(cur) && !seen.has(cur)) {
			seen.add(cur);
			cur = this.keyAlias.get(cur) as string;
		}
		return cur;
	}

	private aliasKey(from: string, to: string) {
		if (from === to) return;
		this.keyAlias.set(from, to);
		for (const set of [this.hidden, this.pinned, this.extraNodes]) {
			if (set.has(from)) {
				set.delete(from);
				set.add(to);
			}
		}
		if (this.positions[from]) this.positions[to] = this.positions[from];
	}

	private nodeIdOf(key: string): number {
		const parsed = parseNodeKey(this.resolveKey(key));
		if (!parsed || parsed.kind !== 'node') throw new GraphApiError('Not a free node.');
		return parsed.id;
	}

	private edgeBody(e: GraphEdge): CreateGraphEdgeBody {
		const body: CreateGraphEdgeBody = {
			source: this.resolveKey(e.source),
			target: this.resolveKey(e.target),
			directed: e.directed,
			label: e.label,
			description: e.description,
			confidence: e.confidence,
			event_ids: [...(e.event_ids ?? [])]
		};
		if (e.relation?.id !== null && e.relation?.id !== undefined)
			body.relation_type_id = e.relation.id;
		else body.relation = e.relation?.name;
		return body;
	}

	private async run<T>(fn: () => Promise<T>): Promise<T> {
		try {
			return await fn();
		} finally {
			await this.refresh();
		}
	}

	async createEdge(body: CreateGraphEdgeBody, label = 'Create relation'): Promise<GraphEdge> {
		return this.run(async () => {
			const created = unwrap(
				await CaseGraphService.createEdge(this.caseId, body),
				'Could not create the relation.'
			);
			const originalId = created.id as number;
			// Redo cites the timeline event created the first time rather than
			// recording another one.
			const replay: CreateGraphEdgeBody = { ...body };
			if (created.timeline_event_id !== undefined) {
				delete replay.timeline_event;
				replay.event_ids = [...(body.event_ids ?? []), created.timeline_event_id];
			}
			this.history.push({
				label,
				undo: async () => {
					unwrap(
						await CaseGraphService.deleteEdge(this.caseId, this.resolveEdgeId(originalId)),
						'Could not delete the relation.'
					);
					await this.refresh();
				},
				redo: async () => {
					const again = unwrap(
						await CaseGraphService.createEdge(this.caseId, {
							...replay,
							source: this.resolveKey(body.source),
							target: this.resolveKey(body.target)
						}),
						'Could not create the relation.'
					);
					this.edgeAlias.set(this.resolveEdgeId(originalId), again.id as number);
					await this.refresh();
				}
			});
			return created;
		});
	}

	/** Store a derived edge as a manual one, keeping its supporting events. */
	materialiseEdge(e: GraphEdge) {
		return this.createEdge(
			{
				source: e.source,
				target: e.target,
				relation: e.relation.name,
				directed: e.directed,
				event_ids: [...(e.event_ids ?? [])]
			},
			'Materialise relation'
		);
	}

	async updateEdge(e: GraphEdge, patch: UpdateGraphEdgeBody): Promise<GraphEdge> {
		if (!isStoredEdge(e)) throw new GraphApiError('Derived relations cannot be edited.');
		const before: UpdateGraphEdgeBody = {};
		for (const k of Object.keys(patch) as (keyof UpdateGraphEdgeBody)[]) {
			switch (k) {
				case 'relation_type_id':
					if (e.relation.id !== null) before.relation_type_id = e.relation.id;
					break;
				case 'relation':
					before.relation = e.relation.name;
					break;
				case 'directed':
					before.directed = e.directed;
					break;
				case 'label':
					before.label = e.label;
					break;
				case 'description':
					before.description = e.description;
					break;
				case 'confidence':
					before.confidence = e.confidence;
					break;
				case 'review_state':
					before.review_state = e.review_state;
					break;
				case 'first_seen':
					before.first_seen = e.first_seen;
					break;
				case 'last_seen':
					before.last_seen = e.last_seen;
					break;
				case 'event_ids':
					before.event_ids = [...(e.event_ids ?? [])];
					break;
			}
		}
		const id = e.id as number;
		return this.run(async () => {
			const updated = unwrap(
				await CaseGraphService.updateEdge(this.caseId, this.resolveEdgeId(id), patch),
				'Could not update the relation.'
			);
			this.history.push({
				label: 'Edit relation',
				undo: async () => {
					unwrap(
						await CaseGraphService.updateEdge(this.caseId, this.resolveEdgeId(id), before),
						'Could not update the relation.'
					);
					await this.refresh();
				},
				redo: async () => {
					unwrap(
						await CaseGraphService.updateEdge(this.caseId, this.resolveEdgeId(id), patch),
						'Could not update the relation.'
					);
					await this.refresh();
				}
			});
			return updated;
		});
	}

	/**
	 * Same patch on several stored edges (table bulk edit): one history entry,
	 * one refetch. Each edge gets back its own previous values on undo.
	 */
	async updateEdges(edges: GraphEdge[], patch: UpdateGraphEdgeBody, label = 'Edit relations') {
		const stored = edges.filter(isStoredEdge);
		if (!stored.length) return 0;
		const items = stored.map((e) => {
			const before: UpdateGraphEdgeBody = {};
			if ('relation_type_id' in patch || 'relation' in patch) {
				if (e.relation.id !== null) before.relation_type_id = e.relation.id;
				else before.relation = e.relation.name;
			}
			if ('directed' in patch) before.directed = e.directed;
			if ('label' in patch) before.label = e.label;
			if ('description' in patch) before.description = e.description;
			if ('confidence' in patch) before.confidence = e.confidence;
			if ('review_state' in patch) before.review_state = e.review_state;
			return { id: e.id as number, before };
		});
		const apply = async (pick: (i: (typeof items)[number]) => UpdateGraphEdgeBody) => {
			for (const i of items) {
				unwrap(
					await CaseGraphService.updateEdge(this.caseId, this.resolveEdgeId(i.id), pick(i)),
					'Could not update the relation.'
				);
			}
		};
		await this.run(async () => {
			await apply(() => patch);
			this.history.push({
				label,
				undo: async () => {
					await apply((i) => i.before);
					await this.refresh();
				},
				redo: async () => {
					await apply(() => patch);
					await this.refresh();
				}
			});
		});
		return items.length;
	}

	async deleteEdges(edges: GraphEdge[]) {
		const stored = edges.filter(isStoredEdge);
		if (!stored.length) return;
		const snapshots = stored.map((e) => ({ id: e.id as number, body: this.edgeBody(e) }));
		await this.run(async () => {
			for (const s of snapshots) {
				unwrap(
					await CaseGraphService.deleteEdge(this.caseId, this.resolveEdgeId(s.id)),
					'Could not delete the relation.'
				);
			}
			this.history.push({
				label: snapshots.length > 1 ? `Delete ${snapshots.length} relations` : 'Delete relation',
				undo: async () => {
					for (const s of snapshots) {
						const again = unwrap(
							await CaseGraphService.createEdge(this.caseId, {
								...s.body,
								source: this.resolveKey(s.body.source),
								target: this.resolveKey(s.body.target)
							}),
							'Could not restore the relation.'
						);
						this.edgeAlias.set(this.resolveEdgeId(s.id), again.id as number);
					}
					await this.refresh();
				},
				redo: async () => {
					for (const s of snapshots) {
						unwrap(
							await CaseGraphService.deleteEdge(this.caseId, this.resolveEdgeId(s.id)),
							'Could not delete the relation.'
						);
					}
					await this.refresh();
				}
			});
		});
		const rail = this.rail;
		if (rail?.type === 'edge' && stored.some((e) => e.key === rail.key)) this.rail = null;
	}

	async reverseEdge(e: GraphEdge) {
		if (!isStoredEdge(e)) throw new GraphApiError('Derived relations cannot be reversed.');
		const id = e.id as number;
		const reverse = async () =>
			unwrap(
				await CaseGraphService.reverseEdge(this.caseId, this.resolveEdgeId(id)),
				'Could not reverse the relation.'
			);
		await this.run(async () => {
			await reverse();
			this.history.push({
				label: 'Reverse relation',
				undo: async () => {
					await reverse();
					await this.refresh();
				},
				redo: async () => {
					await reverse();
					await this.refresh();
				}
			});
		});
	}

	async reviewEdge(e: GraphEdge, decision: GraphReviewDecision) {
		if (!isStoredEdge(e)) throw new GraphApiError('Derived relations cannot be reviewed.');
		const id = e.id as number;
		const previous = e.review_state;
		await this.run(async () => {
			unwrap(
				await CaseGraphService.reviewEdge(this.caseId, this.resolveEdgeId(id), decision),
				'Could not review the relation.'
			);
			this.history.push({
				label: decision === 'accept' ? 'Accept relation' : 'Reject relation',
				undo: async () => {
					unwrap(
						await CaseGraphService.updateEdge(this.caseId, this.resolveEdgeId(id), {
							review_state: previous
						}),
						'Could not update the relation.'
					);
					await this.refresh();
				},
				redo: async () => {
					unwrap(
						await CaseGraphService.reviewEdge(this.caseId, this.resolveEdgeId(id), decision),
						'Could not review the relation.'
					);
					await this.refresh();
				}
			});
		});
	}

	async createFreeNode(body: CreateFreeNodeBody, at?: Position | null): Promise<GraphNode> {
		return this.run(async () => {
			const node = unwrap(
				await CaseGraphService.createNode(this.caseId, body),
				'Could not create the node.'
			);
			const originalKey = node.key;
			if (at) this.placeAt(node.key, at);
			this.history.push({
				label: 'Create node',
				undo: async () => {
					unwrap(
						await CaseGraphService.deleteNode(this.caseId, this.nodeIdOf(originalKey)),
						'Could not delete the node.'
					);
					await this.refresh();
				},
				redo: async () => {
					const again = unwrap(
						await CaseGraphService.createNode(this.caseId, body),
						'Could not create the node.'
					);
					const lastKey = this.resolveKey(originalKey);
					if (this.positions[lastKey]) this.placeAt(again.key, this.positions[lastKey]);
					this.aliasKey(lastKey, again.key);
					await this.refresh();
				}
			});
			return node;
		});
	}

	async updateFreeNode(node: GraphNode, patch: UpdateFreeNodeBody) {
		const before: UpdateFreeNodeBody = {};
		if ('label' in patch) before.label = node.label;
		if ('node_type' in patch)
			before.node_type = (node.type ?? 'other') as UpdateFreeNodeBody['node_type'];
		if ('description' in patch) before.description = node.description ?? null;
		if ('icon' in patch) before.icon = node.icon ?? null;
		if ('color' in patch) before.color = node.color ?? null;
		const key = node.key;
		await this.run(async () => {
			unwrap(
				await CaseGraphService.updateNode(this.caseId, this.nodeIdOf(key), patch),
				'Could not update the node.'
			);
			this.history.push({
				label: 'Edit node',
				undo: async () => {
					unwrap(
						await CaseGraphService.updateNode(this.caseId, this.nodeIdOf(key), before),
						'Could not update the node.'
					);
					await this.refresh();
				},
				redo: async () => {
					unwrap(
						await CaseGraphService.updateNode(this.caseId, this.nodeIdOf(key), patch),
						'Could not update the node.'
					);
					await this.refresh();
				}
			});
		});
	}

	async deleteFreeNode(node: GraphNode) {
		const key = node.key;
		const body: CreateFreeNodeBody = {
			label: node.label,
			node_type: (node.type ?? 'other') as CreateFreeNodeBody['node_type'],
			description: node.description ?? null,
			icon: node.icon ?? null,
			color: node.color ?? null,
			custom_attributes: node.custom_attributes ?? null
		};
		const edges = this.edges
			.filter((e) => isStoredEdge(e) && (e.source === key || e.target === key))
			.map((e) => ({ id: e.id as number, body: this.edgeBody(e) }));
		const position = this.cy?.getElementById(key).nonempty()
			? { ...this.cy.getElementById(key).position() }
			: this.positions[key];
		await this.run(async () => {
			unwrap(
				await CaseGraphService.deleteNode(this.caseId, this.nodeIdOf(key)),
				'Could not delete the node.'
			);
			if (this.rail?.type === 'node' && this.rail.key === key) this.rail = null;
			this.history.push({
				label: 'Delete node',
				undo: async () => {
					const again = unwrap(
						await CaseGraphService.createNode(this.caseId, body),
						'Could not restore the node.'
					);
					this.aliasKey(this.resolveKey(key), again.key);
					if (position) this.placeAt(again.key, position);
					for (const s of edges) {
						const e = unwrap(
							await CaseGraphService.createEdge(this.caseId, {
								...s.body,
								source: this.resolveKey(s.body.source),
								target: this.resolveKey(s.body.target)
							}),
							'Could not restore a relation of the node.'
						);
						this.edgeAlias.set(this.resolveEdgeId(s.id), e.id as number);
					}
					await this.refresh();
				},
				redo: async () => {
					unwrap(
						await CaseGraphService.deleteNode(this.caseId, this.nodeIdOf(key)),
						'Could not delete the node.'
					);
					await this.refresh();
				}
			});
		});
	}

	/** Promote a free node to an asset / IOC. Not undoable (it creates a case object). */
	async promoteFreeNode(node: GraphNode, body: PromoteFreeNodeBody) {
		const key = node.key;
		return this.run(async () => {
			const res = unwrap(
				await CaseGraphService.promoteNode(this.caseId, this.nodeIdOf(key), body),
				'Could not promote the node.'
			);
			const position = this.cy?.getElementById(key).nonempty()
				? { ...this.cy.getElementById(key).position() }
				: this.positions[key];
			this.aliasKey(key, res.key);
			this.extraNodes.add(res.key);
			if (position) this.placeAt(res.key, position);
			if (this.rail?.type === 'node' && this.rail.key === key)
				this.rail = { type: 'node', key: res.key };
			return res;
		});
	}

	async paste(body: GraphPasteBody, at?: Position | null): Promise<GraphPasteResult> {
		return this.run(async () => {
			const result = unwrap(
				await CaseGraphService.paste(this.caseId, body),
				'Could not import the indicators.'
			);
			let created = [...result.created];
			let edgeIds = result.edges.map((e) => e.id).filter((id): id is number => id !== null);
			this.addToCanvas([...result.created, ...result.existing], at);
			if (body.link_to) this.addToCanvas([body.link_to]);
			this.history.push({
				label: 'Paste indicators',
				undo: async () => {
					for (const id of edgeIds) {
						unwrap(
							await CaseGraphService.deleteEdge(this.caseId, id),
							'Could not delete a relation.'
						);
					}
					for (const key of created) {
						const p = parseNodeKey(key);
						if (p?.kind === 'ioc') {
							unwrap(await CaseIocsService.remove(this.caseId, p.id), 'Could not delete an IOC.');
						}
					}
					await this.refresh();
				},
				redo: async () => {
					const again = unwrap(
						await CaseGraphService.paste(this.caseId, {
							...body,
							link_to: body.link_to ? this.resolveKey(body.link_to) : undefined
						}),
						'Could not import the indicators.'
					);
					created = [...again.created];
					edgeIds = again.edges.map((e) => e.id).filter((id): id is number => id !== null);
					this.addToCanvas([...again.created, ...again.existing], at);
					await this.refresh();
				}
			});
			return result;
		});
	}

	/**
	 * Register an asset / IOC created inline from the canvas. Undo takes it off
	 * the canvas (the case object itself is kept — deleting it is done from
	 * its own page, where its other links are visible).
	 */
	async trackCreatedObject(key: GraphNodeKey, at?: Position | null) {
		this.addToCanvas([key], at);
		await this.refresh();
		this.history.push({
			label: 'Add to graph',
			undo: async () => {
				this.extraNodes.delete(key);
				this.hidden.add(key);
				this.markDirty();
			},
			redo: async () => {
				this.addToCanvas([key]);
			}
		});
	}

	/** Add tags to assets / IOCs (merging with their current tags); undo restores them. */
	async addTags(keys: GraphNodeKey[], tags: string[]) {
		const clean = tags.map((t) => t.trim()).filter(Boolean);
		if (!clean.length) return 0;
		const before = new Map<string, string[]>();
		const write = async (key: string, list: string[]) => {
			const p = parseNodeKey(key);
			if (!p) return;
			const joined = list.join(',');
			if (p.kind === 'asset') {
				unwrap(
					await CaseAssetsService.update(this.caseId, p.id, { asset_tags: joined }),
					'Could not tag the asset.'
				);
			} else if (p.kind === 'ioc') {
				unwrap(
					await CaseIocsService.update(this.caseId, p.id, { ioc_tags: joined }),
					'Could not tag the IOC.'
				);
			}
		};
		let count = 0;
		await this.run(async () => {
			for (const key of keys) {
				const n = this.node(key);
				if (!n || (n.kind !== 'asset' && n.kind !== 'ioc')) continue;
				const current = n.tags ?? [];
				const next = [...new Set([...current, ...clean])];
				if (next.length === current.length) continue;
				before.set(key, current);
				await write(key, next);
				count++;
			}
			if (!before.size) return;
			this.history.push({
				label: 'Add tags',
				undo: async () => {
					for (const [key, list] of before) await write(key, list);
					await this.refresh();
				},
				redo: async () => {
					for (const [key, list] of before) await write(key, [...new Set([...list, ...clean])]);
					await this.refresh();
				}
			});
		});
		return count;
	}

	/** Set an asset flag on assets; undo clears it where it was not set before. */
	async flagAssets(keys: GraphNodeKey[], flagId: number, reason: string | null) {
		const targets = keys
			.map((k) => this.node(k))
			.filter((n): n is GraphNode => !!n && n.kind === 'asset')
			.filter((n) => !(n.flags ?? []).some((f) => f.id === flagId));
		if (!targets.length) return 0;
		const set = async () => {
			for (const n of targets) {
				unwrap(
					await AssetFlagsService.setAssetFlag(this.caseId, n.id, flagId, { reason }),
					`Could not flag ${n.label}.`
				);
			}
		};
		await this.run(async () => {
			await set();
			this.history.push({
				label: 'Flag assets',
				undo: async () => {
					for (const n of targets) {
						unwrap(
							await AssetFlagsService.clearAssetFlag(this.caseId, n.id, flagId),
							`Could not clear the flag of ${n.label}.`
						);
					}
					await this.refresh();
				},
				redo: async () => {
					await set();
					await this.refresh();
				}
			});
		});
		return targets.length;
	}

	/**
	 * Create one case task about the given objects (bulk action). The task
	 * description lists them; undo deletes the task.
	 */
	async createTask(
		keys: GraphNodeKey[],
		task: { title: string; statusId: number; description?: string; tags?: string }
	) {
		const lines = keys
			.map((k) => this.node(k))
			.filter((n): n is GraphNode => !!n)
			.map((n) => `- ${n.kind}: ${n.label}`);
		const description = [task.description?.trim(), lines.length ? lines.join('\n') : '']
			.filter(Boolean)
			.join('\n\n');
		const body = {
			task_title: task.title,
			task_status_id: task.statusId,
			task_assignees_id: [] as number[],
			task_description: description,
			task_tags: task.tags
		};
		const create = async () =>
			unwrap(await CaseTasksService.create(this.caseId, body), 'Could not create the task.').id;
		let taskId = await create();
		this.history.push({
			label: 'Create task',
			undo: async () => {
				unwrap(await CaseTasksService.remove(this.caseId, taskId), 'Could not delete the task.');
			},
			redo: async () => {
				taskId = await create();
			}
		});
		if (this.include.includes('tasks')) await this.refresh();
		return taskId;
	}

	async undo() {
		return this.history.undo();
	}

	async redo() {
		return this.history.redo();
	}
}

const CASE_GRAPH_CTX = Symbol('case-graph');

export const setCaseGraphContext = (state: CaseGraphState) => setContext(CASE_GRAPH_CTX, state);

/** For extensions mounted inside the graph page. */
export const getCaseGraphContext = () => getContext<CaseGraphState | undefined>(CASE_GRAPH_CTX);

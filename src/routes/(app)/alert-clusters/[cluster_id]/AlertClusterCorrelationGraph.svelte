<script lang="ts">
	import { mode } from 'mode-watcher';
	import type { Core, NodeSingular } from 'cytoscape';
	import {
		BellIcon,
		FingerprintIcon,
		HardDriveIcon,
		MaximizeIcon,
		RefreshCwIcon,
		SearchIcon,
		ShuffleIcon,
		XIcon,
		ZoomInIcon,
		ZoomOutIcon,
		ChevronRightIcon,
		ArrowRightIcon,
		ExternalLinkIcon
	} from 'lucide-svelte';
	import alertSvg from 'lucide-static/icons/bell.svg?raw';
	import iocSvg from 'lucide-static/icons/link.svg?raw';
	import { goto } from '$app/navigation';
	import {
		AlertClustersService,
		type AlertClusterGraph,
		type AlertClusterGraphNode
	} from '$lib/services/alert-clusters.service';
	import {
		CytoscapeGraph,
		applyAssetImageTheme,
		lucideIcon,
		runLayout,
		type CyElementDef,
		type CyNodeEvent,
		type CyStylesheet
	} from '$lib/components/common/CytoscapeGraph';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import { openAlertPivot } from '$lib/utils/alert-pivot';
	import {
		alertGraphEdges,
		graphNodeRawId,
		isHtmlTitle,
		sanitizeGraphTitle,
		shortGraphLabel
	} from '$lib/utils/alert-graph';

	type Group = 'alert' | 'ioc' | 'asset';

	type Props = {
		alertClusterId: number;
		// The parent tab renders this component whether the graph tab is
		// active or not; we only want to fetch on activation so switching
		// through the tabs doesn't fire needless requests on every visit.
		active: boolean;
	};

	let { alertClusterId, active }: Props = $props();

	const isDark = $derived($mode === 'dark');

	// Per-group palette. Matches the filter-chip colors in the toolbar so
	// analysts read chip -> node the same way. Kept as HEX (not tailwind
	// classes) because the canvas wants literal colors on the node ring and
	// on the inlined SVG icons. Dark-mode variants keep the icon stroke
	// legible on the dark canvas.
	const palette = $derived({
		alert: {
			icon: isDark ? '#fb923c' : '#ea580c',
			border: isDark ? '#fb923c' : '#c2410c',
			label: isDark ? '#fdba74' : '#9a3412'
		},
		ioc: {
			icon: isDark ? '#60a5fa' : '#2563eb',
			border: isDark ? '#60a5fa' : '#1d4ed8',
			label: isDark ? '#93c5fd' : '#1e40af'
		},
		asset: {
			icon: isDark ? '#34d399' : '#059669',
			border: isDark ? '#34d399' : '#047857',
			label: isDark ? '#6ee7b7' : '#065f46'
		}
	});

	const alertIcon = $derived(lucideIcon(alertSvg, palette.alert.icon));
	const iocIcon = $derived(lucideIcon(iocSvg, palette.ioc.icon));

	let loading = $state(false);
	let error = $state<string | null>(null);
	let graph = $state.raw<AlertClusterGraph>({ nodes: [], edges: [] });
	let cy = $state.raw<Core | null>(null);
	let layoutRunning = $state(false);

	// Cache scope: fetch once per (cluster, active-flip). Analysts can
	// press the toolbar Refresh button when they want fresh data.
	let lastFetchedAlertClusterId = $state<number | null>(null);

	// UX state
	let searchQuery = $state('');
	let visibleGroups = $state<Record<Group, boolean>>({ alert: true, ioc: true, asset: true });
	let selectedNodeId = $state<string | null>(null);
	let contextMenu = $state<{ open: boolean; x: number; y: number; node?: AlertClusterGraphNode }>({
		open: false,
		x: 0,
		y: 0
	});

	const closeContextMenu = () => (contextMenu = { open: false, x: 0, y: 0 });

	const load = async () => {
		if (loading) return;
		loading = true;
		error = null;
		closeContextMenu();
		selectedNodeId = null;
		try {
			const res = await AlertClustersService.graph(alertClusterId);
			if (res.ok && res.data && typeof res.data === 'object' && 'nodes' in res.data) {
				// A new graph object remounts the canvas (see `{#key graph}`),
				// so fresh data always gets a fresh layout.
				graph = res.data as AlertClusterGraph;
				lastFetchedAlertClusterId = alertClusterId;
			} else {
				const msg =
					(res.data as { message?: string } | null)?.message ??
					res.error?.message ??
					`Failed to load graph (HTTP ${res.status})`;
				error = msg;
				graph = { nodes: [], edges: [] };
			}
		} catch (err) {
			error = (err as Error).message;
			graph = { nodes: [], edges: [] };
		} finally {
			loading = false;
		}
	};

	// Lazy load on first activation. `active` is a prop that flips true
	// when the parent's `activeTab === 'graph'`. Re-loads on alert cluster id
	// change; a manual refresh clears `lastFetchedAlertClusterId` too.
	$effect(() => {
		if (!active) return;
		if (lastFetchedAlertClusterId === alertClusterId) return;
		void load();
	});

	// Counts drive the filter-chip badges + the search hit tally.
	const groupCounts = $derived.by<Record<Group, number>>(() => {
		const counts: Record<Group, number> = { alert: 0, ioc: 0, asset: 0 };
		for (const n of graph.nodes) {
			if (n.group === 'alert') counts.alert++;
			else if (n.group === 'ioc') counts.ioc++;
			else if (n.group === 'asset') counts.asset++;
		}
		return counts;
	});

	// Search matches any node whose label or (backend-supplied) title
	// contains the query. Empty query = every node matches. Group toggles
	// still apply on top — a search hit inside a hidden group stays out.
	const matches = $derived.by<Set<string>>(() => {
		const q = searchQuery.trim().toLowerCase();
		const hits = new Set<string>();
		for (const n of graph.nodes) {
			if (!visibleGroups[n.group as Group]) continue;
			const label = (n.label ?? '').toLowerCase();
			const title = (n.title ?? '').toLowerCase();
			if (!q || label.includes(q) || title.includes(q)) hits.add(n.id);
		}
		return hits;
	});

	const searchHitCount = $derived(searchQuery.trim() ? matches.size : 0);
	const hasActiveFilter = $derived(
		searchQuery.trim().length > 0 ||
			!visibleGroups.alert ||
			!visibleGroups.ioc ||
			!visibleGroups.asset
	);

	// Ordered list of hit ids, stable across renders, used for
	// "next match" cycling via Enter in the search input.
	const orderedMatches = $derived.by<string[]>(() => {
		if (!searchQuery.trim()) return [];
		return graph.nodes.filter((n) => matches.has(n.id)).map((n) => n.id);
	});
	let matchCursor = $state(0);

	const displayedCount = $derived(
		graph.nodes.filter((n) => visibleGroups[n.group as Group]).length
	);

	// Filtered groups are hidden (class `hidden`) and search misses dimmed,
	// rather than removed from the element list: every node keeps its
	// position whatever the filters, and edges to a hidden node hide with it.
	// Theme switches only restyle the elements in place.
	const elements = $derived.by<CyElementDef[]>(() => {
		const nodes: CyElementDef[] = graph.nodes.map((node) => {
			const g = node.group as Group;
			const groupPalette = palette[g] ?? palette.alert;
			const image =
				g === 'alert'
					? alertIcon
					: g === 'ioc'
						? iocIcon
						: typeof node.image === 'string'
							? applyAssetImageTheme(node.image, isDark)
							: undefined;
			const classes = !visibleGroups[g] ? ['hidden'] : matches.has(node.id) ? [] : ['dimmed'];
			return {
				group: 'nodes',
				data: {
					id: node.id,
					label: shortGraphLabel(node.label),
					group: g,
					color: groupPalette.border,
					labelColor: groupPalette.label,
					size: g === 'asset' ? 44 : 40,
					...(image ? { image, iconScale: g === 'asset' ? 0.7 : 0.55 } : {})
				},
				classes
			};
		});
		const edges = alertGraphEdges(graph.edges).map((e) => ({
			...e,
			classes: matches.has(e.data.source) && matches.has(e.data.target) ? [] : ['dimmed']
		}));
		return [...nodes, ...edges];
	});

	const stylesheet: CyStylesheet = [
		{ selector: 'node[labelColor]', style: { color: 'data(labelColor)' } },
		{ selector: 'node', style: { 'font-size': 12, 'text-outline-width': 3 } }
	];

	const nodeById = $derived.by(() => {
		const m = new Map<string, AlertClusterGraphNode>();
		for (const n of graph.nodes) m.set(n.id, n);
		return m;
	});

	const selectedNode = $derived(selectedNodeId ? (nodeById.get(selectedNodeId) ?? null) : null);

	// When a node is selected, compute its neighbours (edges emanating from
	// or terminating at it) so the details rail can list them with quick
	// pivots. Alerts show connected IOCs+assets; IOCs/assets show which
	// alerts they appeared in.
	const selectedNeighbours = $derived.by<AlertClusterGraphNode[]>(() => {
		if (!selectedNodeId) return [];
		const neighbourIds = new Set<string>();
		for (const e of graph.edges) {
			if (e.from === selectedNodeId) neighbourIds.add(e.to);
			else if (e.to === selectedNodeId) neighbourIds.add(e.from);
		}
		const out: AlertClusterGraphNode[] = [];
		for (const id of neighbourIds) {
			const n = nodeById.get(id);
			if (n) out.push(n);
		}
		// Alerts first (usually fewer, more actionable), then iocs, then assets.
		return out.sort((a, b) => {
			const order = { alert: 0, ioc: 1, asset: 2 } as const;
			return order[a.group] - order[b.group];
		});
	});

	// ---- Imperative helpers ----------------------------------------
	// Mirror the selection into the canvas. Runs as an effect so selection
	// changes coming from ANY source (canvas click, details-rail neighbour
	// click, keyboard search cycling) land on the same code path. Selection
	// is styling only: it never touches positions or the viewport — the
	// canvas only resizes when the rail opens, it never refits.
	$effect(() => {
		const c = cy;
		const id = selectedNodeId;
		if (!c) return;
		c.batch(() => {
			c.nodes(':selected')
				.filter((n) => n.id() !== id)
				.unselect();
			if (id) c.getElementById(id).select();
		});
	});

	const ease = 'ease-in-out-quad' as const;

	const focusNode = (nodeId: string) => {
		selectedNodeId = nodeId;
		const node = cy?.getElementById(nodeId);
		if (!cy || !node || node.empty() || !node.visible()) return;
		// Selection sync happens in the effect above; here we just
		// pan/zoom the viewport to bring the target into view.
		cy.stop();
		cy.animate({ zoom: 1.2, center: { eles: node }, duration: 400, easing: ease });
	};

	const zoomBy = (factor: number) => {
		if (!cy) return;
		const c = cy;
		const level = Math.min(c.maxZoom(), Math.max(c.minZoom(), c.zoom() * factor));
		c.stop();
		c.animate({
			zoom: { level, renderedPosition: { x: c.width() / 2, y: c.height() / 2 } },
			duration: 200,
			easing: ease
		});
	};

	const fit = () => {
		if (!cy) return;
		cy.stop();
		cy.animate({
			fit: { eles: cy.elements(':visible'), padding: 40 },
			duration: 400,
			easing: ease
		});
	};

	// The layout runs once when the graph arrives, then nodes stay where
	// they are (the equivalent of the old physics auto-freeze). This
	// re-runs it on demand, on the visible nodes.
	const relayout = async () => {
		if (!cy || layoutRunning) return;
		layoutRunning = true;
		try {
			await runLayout(cy, 'fcose', { animate: true });
		} finally {
			layoutRunning = false;
		}
	};

	const handleSearchKeydown = (e: KeyboardEvent) => {
		if (e.key !== 'Enter') return;
		if (orderedMatches.length === 0) return;
		e.preventDefault();
		matchCursor = (matchCursor + 1) % orderedMatches.length;
		focusNode(orderedMatches[matchCursor]);
	};

	// When search text changes, snap the cursor back to the first hit
	// so pressing Enter after typing lands on the top match.
	$effect(() => {
		void searchQuery;
		matchCursor = 0;
	});

	// ---- Graph interaction handlers --------------------------------
	const onTapNode = (e: CyNodeEvent) => {
		closeContextMenu();
		selectedNodeId = e.target.id();
	};

	const onTapCanvas = () => {
		closeContextMenu();
		selectedNodeId = null;
	};

	const onCxtTapNode = (e: CyNodeEvent) => {
		const node = nodeById.get(e.target.id());
		if (!node) {
			closeContextMenu();
			return;
		}
		contextMenu = { open: true, x: e.renderedPosition.x, y: e.renderedPosition.y, node };
	};

	const openOrPivot = (node: AlertClusterGraphNode) => {
		if (node.group === 'alert') {
			// Alerts are the one group whose raw id is what we want:
			// `/alerts/[alert_id]` is keyed on the numeric primary key.
			goto(`/alerts/${graphNodeRawId(node.id)}`);
			return;
		}

		// ...but the alerts *list* filters on the IOC/asset value, not on a key.
		// This used to pivot on `graphNodeRawId(node.id)`, and the graph builds
		// its ids as `ioc_<ioc_id>` / `asset_<asset_id>` — so the query ran
		// `ioc_value IN ('42')` and returned nothing, every time.
		//
		// `node.label` is the value the filter wants, and it arrives here
		// untruncated: `nodeById` is built from the raw `graph.nodes`, not from
		// the canvas elements where `shortGraphLabel` clips at 42 characters.
		//
		// New tab, unlike the alert branch above: the pivot is a lookup made
		// *while* reading the graph, and a same-tab navigation would discard the
		// layout, selection and zoom the analyst just built up.
		openAlertPivot(node.group, node.label, window.location.href);
	};

	const toggleGroup = (g: Group) => {
		visibleGroups = { ...visibleGroups, [g]: !visibleGroups[g] };
	};
</script>

<!--
  Full-height layout. The tab-content wrapper hands us `h-full` so we
  fill everything below the tab strip. Left sidebar collects search +
  legend + filters; center is the canvas; right sidebar shows the
  selected node's details (collapses when nothing is selected).
-->
<div class="flex h-full min-h-0 w-full flex-col">
	<!-- Toolbar over the canvas — search + refresh + zoom + fit + layout. -->
	<div class="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
		<div class="relative min-w-[16rem] max-w-md flex-1">
			<SearchIcon
				class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				bind:value={searchQuery}
				onkeydown={handleSearchKeydown}
				placeholder="Search alerts, IOCs, assets…  (Enter to cycle)"
				class="h-8 pl-8 pr-16 text-xs"
			/>
			{#if searchQuery.trim().length > 0}
				<div class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1">
					<span
						class="rounded-sm bg-muted px-1.5 py-0.5 text-2xs tabular-nums text-muted-foreground"
					>
						{searchHitCount}
					</span>
					<button
						type="button"
						class="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-label="Clear search"
						onclick={() => (searchQuery = '')}
					>
						<XIcon class="h-3 w-3" />
					</button>
				</div>
			{/if}
		</div>

		<!-- Group filter chips. Match the shape of the tab-header badges
			 so users read them as filters on the same taxonomy. -->
		<div class="flex items-center gap-1">
			<button
				type="button"
				class="inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-xs transition-colors {visibleGroups.alert
					? 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300'
					: 'border-border bg-transparent text-muted-foreground hover:bg-muted/50'}"
				onclick={() => toggleGroup('alert')}
				title="Toggle alert nodes"
			>
				<BellIcon class="h-3 w-3" />
				<span>Alerts</span>
				<span class="tabular-nums">{groupCounts.alert}</span>
			</button>
			<button
				type="button"
				class="inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-xs transition-colors {visibleGroups.ioc
					? 'border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-300'
					: 'border-border bg-transparent text-muted-foreground hover:bg-muted/50'}"
				onclick={() => toggleGroup('ioc')}
				title="Toggle IOC nodes"
			>
				<FingerprintIcon class="h-3 w-3" />
				<span>IOCs</span>
				<span class="tabular-nums">{groupCounts.ioc}</span>
			</button>
			<button
				type="button"
				class="inline-flex h-7 items-center gap-1 rounded-sm border px-2 text-xs transition-colors {visibleGroups.asset
					? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
					: 'border-border bg-transparent text-muted-foreground hover:bg-muted/50'}"
				onclick={() => toggleGroup('asset')}
				title="Toggle asset nodes"
			>
				<HardDriveIcon class="h-3 w-3" />
				<span>Assets</span>
				<span class="tabular-nums">{groupCounts.asset}</span>
			</button>
		</div>

		<div class="ml-auto flex items-center gap-1">
			<Button
				variant="ghost"
				size="xs"
				onclick={() => zoomBy(1.25)}
				title="Zoom in"
				disabled={!cy || loading}
			>
				<ZoomInIcon class="h-3.5 w-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="xs"
				onclick={() => zoomBy(0.8)}
				title="Zoom out"
				disabled={!cy || loading}
			>
				<ZoomOutIcon class="h-3.5 w-3.5" />
			</Button>
			<Button variant="ghost" size="xs" onclick={fit} title="Fit to view" disabled={!cy || loading}>
				<MaximizeIcon class="h-3.5 w-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="xs"
				onclick={relayout}
				title="Re-run layout"
				disabled={!cy || loading || layoutRunning}
			>
				<ShuffleIcon class="h-3.5 w-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="xs"
				onclick={() => {
					lastFetchedAlertClusterId = null;
					void load();
				}}
				title="Refresh graph"
				disabled={loading}
			>
				<RefreshCwIcon class="h-3.5 w-3.5 {loading ? 'animate-spin' : ''}" />
			</Button>
		</div>
	</div>

	<!-- Canvas + right details rail. -->
	<div class="relative flex min-h-0 flex-1">
		<div class="relative min-w-0 flex-1 bg-muted/10" data-testid="alert-cluster-graph">
			{#if graph.nodes.length > 0}
				{#key graph}
					<CytoscapeGraph
						{elements}
						{stylesheet}
						initialLayout="fcose"
						boxSelectionEnabled={false}
						selectionType="single"
						onReady={(c) => (cy = c)}
						{onTapNode}
						{onTapCanvas}
						{onCxtTapNode}
						onCxtTapCanvas={closeContextMenu}
						onCxtTapEdge={closeContextMenu}
						nodeTooltip={tooltip}
						nodeTooltipEnabled={(n) => !!nodeById.get(n.id())?.title}
					/>
				{/key}
			{/if}

			{#if contextMenu.open && contextMenu.node}
				<div
					class="absolute z-20 rounded-md border bg-background p-1 shadow-xl"
					style={`left:${contextMenu.x}px;top:${contextMenu.y}px;transform:translate(8px, 8px);`}
					data-testid="graph-context-menu"
				>
					<!--
					  The icon distinguishes where the click lands: an arrow for the
					  in-tab alert navigation, the external-link glyph only for the
					  pivot, which opens a new tab (see `openOrPivot`). Using one
					  icon for both made it decoration rather than a signal.
					-->
					<Button
						variant="ghost"
						size="xs"
						class="w-full justify-start gap-2"
						title={contextMenu.node.group === 'alert'
							? undefined
							: 'Opens the filtered alert list in a new tab'}
						onclick={() => {
							if (contextMenu.node) openOrPivot(contextMenu.node);
							closeContextMenu();
						}}
					>
						{#if contextMenu.node.group === 'alert'}
							<ArrowRightIcon class="h-3 w-3" />
							View alert #{graphNodeRawId(contextMenu.node.id)}
						{:else}
							<ExternalLinkIcon class="h-3 w-3" />
							Pivot alerts by {contextMenu.node.group}
							<span class="sr-only">(opens in a new tab)</span>
						{/if}
					</Button>
				</div>
			{/if}

			{#if loading}
				<div
					class="absolute inset-0 flex items-center justify-center bg-background/40 text-sm text-muted-foreground backdrop-blur-sm"
				>
					<RefreshCwIcon class="mr-2 h-4 w-4 animate-spin" />
					Loading correlation graph…
				</div>
			{:else if error}
				<div class="absolute inset-0 flex items-center justify-center text-sm text-destructive">
					{error}
				</div>
			{:else if !graph.nodes.length}
				<div
					class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground"
				>
					<div>No IOCs or assets on the member alerts yet.</div>
					<div class="text-xs">
						Add or import indicators on the alerts to see the graph populate.
					</div>
				</div>
			{:else if displayedCount === 0}
				<div
					class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground"
				>
					<div>Every node is currently filtered out.</div>
					<Button
						variant="outline"
						size="xs"
						onclick={() => {
							visibleGroups = { alert: true, ioc: true, asset: true };
							searchQuery = '';
						}}
					>
						Reset filters
					</Button>
				</div>
			{/if}

			<!-- Legend, bottom-left over the canvas. Small so it doesn't
				 eat visualisation space — hidden below md to reclaim room. -->
			<div
				class="pointer-events-none absolute bottom-2 left-2 hidden gap-3 rounded-md border bg-background/80 px-3 py-1.5 text-2xs text-muted-foreground shadow-sm backdrop-blur-sm md:flex"
			>
				<span class="inline-flex items-center gap-1">
					<BellIcon class="h-3 w-3" /> Alert
				</span>
				<span class="inline-flex items-center gap-1">
					<FingerprintIcon class="h-3 w-3" /> IOC
				</span>
				<span class="inline-flex items-center gap-1">
					<HardDriveIcon class="h-3 w-3" /> Asset
				</span>
			</div>

			<!-- Correlation hint (top-left). Only visible when there IS a
				 graph but no filter is narrowing it, so we don't scream
				 hints over the empty state. -->
			{#if graph.nodes.length > 0 && !hasActiveFilter && !selectedNodeId}
				<div
					class="pointer-events-none absolute left-2 top-2 max-w-xs rounded-md border bg-background/80 px-2.5 py-1.5 text-2xs text-muted-foreground shadow-sm backdrop-blur-sm"
				>
					Click a node to see details. Nodes shared across alerts are correlation points.
				</div>
			{/if}
		</div>

		<!-- Details rail. Slides in only when a node is selected — otherwise
			 the canvas takes the full width. -->
		{#if selectedNode}
			<aside
				class="flex w-80 shrink-0 flex-col overflow-hidden border-l bg-card"
				aria-label="Selected node details"
				data-testid="graph-detail-rail"
			>
				<header class="flex items-center gap-2 border-b px-4 py-3">
					<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
						{#if selectedNode.group === 'alert'}
							<BellIcon class="h-3.5 w-3.5 text-orange-600 dark:text-orange-300" />
						{:else if selectedNode.group === 'ioc'}
							<FingerprintIcon class="h-3.5 w-3.5 text-blue-600 dark:text-blue-300" />
						{:else}
							<HardDriveIcon class="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-300" />
						{/if}
					</div>
					<div class="min-w-0 flex-1">
						<div class="text-2xs uppercase tracking-wide text-muted-foreground">
							{selectedNode.group}
						</div>
						<div class="truncate text-sm font-medium" title={selectedNode.label}>
							{selectedNode.label}
						</div>
					</div>
					<Button
						variant="ghost"
						size="xs"
						onclick={() => (selectedNodeId = null)}
						title="Close details"
					>
						<XIcon class="h-3.5 w-3.5" />
					</Button>
				</header>

				<div class="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
					{#if selectedNode.title}
						<!--
							Backend title is HTML (bold labels, br separators). Same
							DOMPurify pass we run for tooltips — this pane surfaces
							the same field set to the user.
						-->
						<div
							class="whitespace-pre-line rounded-md border bg-muted/20 px-3 py-2 text-xs leading-relaxed [&_b]:font-semibold"
						>
							<!-- eslint-disable-next-line svelte/no-at-html-tags -->
							{@html sanitizeGraphTitle(selectedNode.title)}
						</div>
					{/if}

					<div>
						<div
							class="mb-1.5 flex items-center justify-between text-2xs uppercase tracking-wide text-muted-foreground"
						>
							<span>
								{selectedNode.group === 'alert' ? 'Related indicators' : 'Appears in alerts'}
							</span>
							<span class="tabular-nums">{selectedNeighbours.length}</span>
						</div>
						<ul class="flex flex-col gap-1">
							{#each selectedNeighbours as n (n.id)}
								<li>
									<button
										type="button"
										class="group flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted/50"
										onclick={() => focusNode(n.id)}
									>
										{#if n.group === 'alert'}
											<BellIcon class="h-3 w-3 shrink-0 text-orange-500" />
										{:else if n.group === 'ioc'}
											<FingerprintIcon class="h-3 w-3 shrink-0 text-blue-500" />
										{:else}
											<HardDriveIcon class="h-3 w-3 shrink-0 text-emerald-500" />
										{/if}
										<span class="min-w-0 flex-1 truncate" title={n.label}>{n.label}</span>
										<ChevronRightIcon
											class="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
										/>
									</button>
								</li>
							{:else}
								<li class="px-2 py-1.5 text-xs text-muted-foreground">No connections.</li>
							{/each}
						</ul>
					</div>
				</div>

				<footer class="border-t px-4 py-3">
					<!-- Same icon split as the context menu above. -->
					<Button
						variant="default"
						size="xs"
						class="w-full justify-between"
						title={selectedNode.group === 'alert'
							? undefined
							: 'Opens the filtered alert list in a new tab'}
						onclick={() => openOrPivot(selectedNode)}
					>
						{#if selectedNode.group === 'alert'}
							Open alert #{graphNodeRawId(selectedNode.id)}
							<ArrowRightIcon class="h-3 w-3" />
						{:else}
							<span>
								Pivot alerts by {selectedNode.group}
								<span class="sr-only">(opens in a new tab)</span>
							</span>
							<ExternalLinkIcon class="h-3 w-3" />
						{/if}
					</Button>
				</footer>
			</aside>
		{/if}
	</div>
</div>

{#snippet tooltip(node: NodeSingular)}
	{@const title = nodeById.get(node.id())?.title}
	{#if isHtmlTitle(title)}
		<div class="[&_b]:font-semibold">
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html sanitizeGraphTitle(title)}
		</div>
	{:else if title}
		<div class="line-clamp-[12] whitespace-pre-line break-words">{title}</div>
	{/if}
{/snippet}

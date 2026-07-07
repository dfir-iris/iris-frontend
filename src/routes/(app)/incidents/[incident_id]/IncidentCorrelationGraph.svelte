<script lang="ts">
	import { mode } from 'mode-watcher';
	import type { IdType, Network, Options } from 'vis-network';
	import DOMPurify from 'dompurify';
	import {
		BellIcon,
		FingerprintIcon,
		HardDriveIcon,
		MaximizeIcon,
		PauseIcon,
		PlayIcon,
		RefreshCwIcon,
		SearchIcon,
		XIcon,
		ZoomInIcon,
		ZoomOutIcon,
		ChevronRightIcon,
		ExternalLinkIcon
	} from 'lucide-svelte';
	import alertSvg from 'lucide-static/icons/bell.svg?raw';
	import iocSvg from 'lucide-static/icons/link.svg?raw';
	import { goto } from '$app/navigation';
	import {
		IncidentsService,
		type IncidentGraph,
		type IncidentGraphNode
	} from '$lib/services/incidents.service';
	import VisNetwork, {
		type VisNode,
		type VisEdge,
		svgToDataUrl,
		withStroke,
		applyAssetImageTheme
	} from '$lib/components/common/VisNetwork';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';

	type Group = 'alert' | 'ioc' | 'asset';

	type Props = {
		incidentId: number;
		// The parent tab renders this component whether the graph tab is
		// active or not; we only want to fetch on activation so switching
		// through the tabs doesn't fire needless requests on every visit.
		active: boolean;
	};

	let { incidentId, active }: Props = $props();

	const isDark = $derived($mode === 'dark');
	const strokeColor = $derived(isDark ? '#f9fafb' : '#111827');

	// Per-group palette. Matches the filter-chip colors in the toolbar so
	// analysts read chip -> node the same way. Kept as HEX (not tailwind
	// classes) because vis-network wants literal colors on node.color and
	// on the inlined SVG icons. Dark-mode variants tune the icon stroke
	// so it stays legible on the dark canvas.
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

	const alertIcon = $derived(svgToDataUrl(withStroke(alertSvg, palette.alert.icon)));
	const iocIcon = $derived(svgToDataUrl(withStroke(iocSvg, palette.ioc.icon)));

	let loading = $state(false);
	let error = $state<string | null>(null);
	let graph = $state<IncidentGraph>({ nodes: [], edges: [] });
	let network = $state<Network | null>(null);

	// Cache scope: fetch once per (incident, active-flip). Analysts can
	// press the toolbar Refresh button when they want fresh data.
	let lastFetchedIncidentId = $state<number | null>(null);

	// UX state
	let searchQuery = $state('');
	let visibleGroups = $state<Record<Group, boolean>>({ alert: true, ioc: true, asset: true });
	let selectedNodeId = $state<string | null>(null);
	let physicsEnabled = $state(true);
	// Set to true whenever we WANT the next stabilization pass to end
	// with physics turned off. Cleared by the toggle button so a user
	// who explicitly hits Play doesn't get frozen again a beat later.
	let autoFreezeArmed = $state(true);
	let contextMenu = $state<{ open: boolean; x: number; y: number; node?: VisNode }>({
		open: false,
		x: 0,
		y: 0
	});

	// Backend tooltip HTML embeds user-controlled fields (ioc_value,
	// asset_name, ip/domain, tags). Sanitize before assigning innerHTML.
	const createTooltip = (html: string) => {
		if (typeof document === 'undefined') return html;
		const el = document.createElement('div');
		el.className = 'related-alert-tooltip';
		el.innerHTML = DOMPurify.sanitize(html, {
			ALLOWED_TAGS: ['b', 'br', 'i', 'em', 'strong', 'span'],
			ALLOWED_ATTR: []
		});
		return el;
	};

	const options = $derived({
		autoResize: true,
		layout: {
			improvedLayout: true,
			randomSeed: incidentId
		},
		nodes: {
			// `scaling.label` shrinks labels as the user zooms out so
			// dense graphs don't drown in overlapping text. The `image`
			// shape sizing gives every icon the same footprint so the
			// canvas reads uniformly regardless of group.
			font: {
				color: strokeColor,
				size: 12,
				strokeWidth: 3,
				strokeColor: isDark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.9)'
			},
			borderWidth: 2,
			shadow: false,
			size: 22,
			shapeProperties: { interpolation: false },
			margin: 8,
			scaling: {
				label: { enabled: true, min: 10, max: 18, drawThreshold: 6 }
			}
		},
		edges: {
			smooth: { enabled: true, type: 'dynamic', roundness: 0.5 },
			color: {
				color: isDark ? 'rgba(148,163,184,0.45)' : 'rgba(100,116,139,0.5)',
				highlight: isDark ? '#60a5fa' : '#2563eb',
				opacity: 0.9
			},
			width: 1,
			selectionWidth: 2
		},
		clickToUse: false,
		interaction: { zoomView: true, hover: true, tooltipDelay: 120 },
		// Sparse layout tuning. `barnesHut` gives us predictable long-range
		// repulsion so nodes push apart quickly instead of clumping in a
		// tight ball like the previous forceAtlas2 config. `avoidOverlap`
		// is the key knob for the screenshot the user showed — with 0 it
		// happily stacks nodes on top of one another. Physics is on only
		// for the initial layout pass; the `stabilizationIterationsDone`
		// handler in handleReady freezes it so drags/zooms don't kick off
		// perpetual jitter.
		physics: {
			enabled: physicsEnabled,
			solver: 'barnesHut',
			barnesHut: {
				gravitationalConstant: -12000,
				centralGravity: 0.15,
				springLength: 180,
				springConstant: 0.04,
				damping: 0.95,
				avoidOverlap: 0.6
			},
			maxVelocity: 30,
			minVelocity: 0.75,
			timestep: 0.35,
			stabilization: {
				enabled: true,
				iterations: 400,
				updateInterval: 50,
				fit: true
			}
		}
	} satisfies Options);

	const load = async () => {
		if (loading) return;
		loading = true;
		error = null;
		contextMenu = { open: false, x: 0, y: 0 };
		selectedNodeId = null;
		// Fresh data means a fresh layout pass; turn physics back on so
		// vis-network stabilizes the new node set, then let the
		// stabilization handler freeze it again.
		physicsEnabled = true;
		autoFreezeArmed = true;
		try {
			const res = await IncidentsService.graph(incidentId);
			if (res.ok && res.data && typeof res.data === 'object' && 'nodes' in res.data) {
				graph = res.data as IncidentGraph;
				lastFetchedIncidentId = incidentId;
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
	// when the parent's `activeTab === 'graph'`. Re-loads on incident id
	// change; a manual refresh clears `lastFetchedIncidentId` too.
	$effect(() => {
		if (!active) return;
		if (lastFetchedIncidentId === incidentId) return;
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

	const dimStroke = $derived(isDark ? '#334155' : '#cbd5e1');
	const dimFont = $derived(isDark ? '#475569' : '#94a3b8');

	// Truncate long labels so a single verbose alert title (or a very
	// long IP/asset name) can't shove every neighbour off screen. Full
	// text remains available in the tooltip and the details rail.
	const shortLabel = (label: string | undefined) => {
		const v = label ?? '';
		return v.length > 42 ? `${v.slice(0, 40)}…` : v;
	};

	// Accent ring for the currently-selected node. Applied via
	// vis-network's built-in selection highlight (`color.highlight`) so
	// selection no longer needs to rebuild the node object — the fix for
	// the "clicking a node collapses the layout" bug. Rebuilding via
	// `derived` reruns the datasets `.clear()` + `.add()` in the
	// VisNetwork wrapper, which drops layout positions and re-triggers
	// stabilization; delegating selection styling to vis-network keeps
	// positions stable across clicks.
	const selectedRing = $derived(isDark ? '#60a5fa' : '#2563eb');

	const nodes = $derived(
		graph.nodes.map((node) => {
			const isMatch = matches.has(node.id);
			const g = node.group as Group;
			const groupPalette = palette[g];
			const title = node.title?.includes('<') ? createTooltip(node.title) : node.title;

			const borderColor = isMatch ? groupPalette.border : dimStroke;
			const fontColor = isMatch ? groupPalette.label : dimFont;

			const base: VisNode = {
				...node,
				label: shortLabel(node.label),
				title,
				borderWidth: 2,
				borderWidthSelected: 4,
				color: {
					border: borderColor,
					background: isDark ? '#0f172a' : '#ffffff',
					highlight: {
						border: selectedRing,
						background: isDark ? '#0f172a' : '#ffffff'
					},
					hover: {
						border: groupPalette.border,
						background: isDark ? '#111827' : '#f8fafc'
					}
				} as unknown as VisNode['color'],
				font: {
					color: fontColor,
					size: 12,
					strokeWidth: 3,
					strokeColor: isDark ? 'rgba(15,23,42,0.85)' : 'rgba(255,255,255,0.9)'
				}
			};

			// `circularImage` draws the icon inside a colored ring —
			// which is the group signal we were missing. Assets keep
			// their asset-type PNG; alerts/IOCs use the tinted lucide
			// SVG data URLs we built from the palette above.
			if (g === 'alert') {
				return {
					...base,
					shape: 'circularImage',
					image: alertIcon,
					size: 20
				} as VisNode;
			}
			if (g === 'ioc') {
				return {
					...base,
					shape: 'circularImage',
					image: iocIcon,
					size: 20
				} as VisNode;
			}
			if (g === 'asset' && typeof node.image === 'string') {
				return {
					...base,
					shape: 'circularImage',
					image: applyAssetImageTheme(node.image, isDark),
					size: 22
				} as VisNode;
			}
			return base;
		})
	);

	// Only render edges whose endpoints both survived the group filter.
	// Otherwise vis-network draws dangling stubs into empty space.
	const visibleNodeIds = $derived(new Set(graph.nodes.filter((n) => visibleGroups[n.group as Group]).map((n) => n.id)));

	const edges = $derived(
		graph.edges
			.filter((e) => visibleNodeIds.has(e.from) && visibleNodeIds.has(e.to))
			.map((e) => {
				const bothHit = matches.has(e.from) && matches.has(e.to);
				return {
					...e,
					color: bothHit
						? undefined
						: {
								color: isDark ? 'rgba(51,65,85,0.4)' : 'rgba(203,213,225,0.6)',
								opacity: 0.5
							}
				} as VisEdge;
			})
	);

	// Filter the visible nodes down to the group toggle. We do this AFTER
	// building the styled node list so search dimming still lines up with
	// the same ids; the filter here just hides whole categories.
	const displayedNodes = $derived(nodes.filter((n) => visibleGroups[(n.group as Group) ?? 'alert']));

	const nodeById = $derived.by(() => {
		const m = new Map<string, IncidentGraphNode>();
		for (const n of graph.nodes) m.set(n.id, n);
		return m;
	});

	const selectedNode = $derived(selectedNodeId ? (nodeById.get(selectedNodeId) ?? null) : null);

	// When a node is selected, compute its neighbours (edges emanating from
	// or terminating at it) so the details rail can list them with quick
	// pivots. Alerts show connected IOCs+assets; IOCs/assets show which
	// alerts they appeared in.
	const selectedNeighbours = $derived.by<IncidentGraphNode[]>(() => {
		if (!selectedNodeId) return [];
		const neighbourIds = new Set<string>();
		for (const e of graph.edges) {
			if (e.from === selectedNodeId) neighbourIds.add(e.to);
			else if (e.to === selectedNodeId) neighbourIds.add(e.from);
		}
		const out: IncidentGraphNode[] = [];
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
	// Push the current selection into vis-network. Runs as an effect so
	// selection changes coming from ANY source (canvas click, details-
	// rail neighbour click, keyboard search cycling) all land on the
	// same code path. Crucially this does NOT rebuild the node dataset:
	// the wrapper's dataset-clear-and-refill happens only when the
	// derived `nodes` array changes, and selection styling now flows
	// through vis-network's built-in `color.highlight` — so clicking a
	// node no longer resets positions or restarts stabilization (which
	// was the bug where clicking an IOC collapsed the whole graph).
	$effect(() => {
		if (!network) return;
		try {
			if (selectedNodeId) {
				network.selectNodes([selectedNodeId]);
			} else {
				network.unselectAll();
			}
		} catch {
			/* vis-network throws if the id isn't in the dataset; ignore */
		}
	});

	const focusNode = (nodeId: string) => {
		selectedNodeId = nodeId;
		if (!network) return;
		try {
			// Selection sync happens in the effect above; here we just
			// pan/zoom the viewport to bring the target into view.
			network.focus(nodeId, {
				scale: 1.2,
				animation: { duration: 400, easingFunction: 'easeInOutQuad' }
			});
		} catch {
			/* ignore */
		}
	};

	const zoomBy = (factor: number) => {
		if (!network) return;
		const scale = network.getScale() * factor;
		network.moveTo({
			scale,
			animation: { duration: 200, easingFunction: 'easeInOutQuad' }
		});
	};

	const fit = () => {
		if (!network) return;
		network.fit({ animation: { duration: 400, easingFunction: 'easeInOutQuad' } });
	};

	const togglePhysics = () => {
		physicsEnabled = !physicsEnabled;
		// User asked for a manual toggle — cancel any pending auto-freeze
		// so their choice isn't undone by the stabilization handler that
		// fires on the next re-layout.
		autoFreezeArmed = false;
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
	const handleClick = (detail: { nodeId?: IdType }) => {
		contextMenu = { open: false, x: 0, y: 0 };
		if (typeof detail.nodeId === 'string') {
			selectedNodeId = detail.nodeId;
		} else {
			selectedNodeId = null;
		}
	};

	const openContextMenu = (detail: { x: number; y: number; nodeId?: IdType }) => {
		if (typeof detail.nodeId !== 'string') {
			contextMenu = { open: false, x: 0, y: 0 };
			return;
		}
		const node = nodeById.get(detail.nodeId);
		if (!node) {
			contextMenu = { open: false, x: 0, y: 0 };
			return;
		}
		contextMenu = { open: true, x: detail.x, y: detail.y, node: node as unknown as VisNode };
	};

	const getRawId = (nodeId: string): string => nodeId.split(/_/)[1];

	const openOrPivot = (node: IncidentGraphNode) => {
		if (node.group === 'alert') {
			goto(`/alerts/${getRawId(node.id)}`);
			return;
		}
		const url = new URL(window.location.href);
		url.pathname = '/alerts/';
		url.search = '';
		url.searchParams.set(node.group === 'asset' ? 'alert_assets' : 'alert_iocs', getRawId(node.id));
		goto(`${url.pathname}?${url.searchParams.toString()}`);
	};

	const toggleGroup = (g: Group) => {
		visibleGroups = { ...visibleGroups, [g]: !visibleGroups[g] };
	};

	// Called by the VisNetwork wrapper as soon as it constructs the
	// Network. We stash the handle so the toolbar / search can drive
	// imperative APIs. We also hook `stabilizationIterationsDone` here
	// to auto-freeze physics — otherwise `forceAtlas2Based` keeps
	// nudging nodes forever on drag/zoom/hover, making the graph
	// feel visually noisy. The user can hit Play to resume the sim.
	const handleReady = (n: Network | null) => {
		network = n;
		if (!n) return;
		n.on('stabilizationIterationsDone', () => {
			if (!autoFreezeArmed) return;
			physicsEnabled = false;
		});
	};
</script>

<!--
  Full-height layout. The tab-content wrapper hands us `h-full` so we
  fill everything below the tab strip. Left sidebar collects search +
  legend + filters; center is the canvas; right sidebar shows the
  selected node's details (collapses when nothing is selected).
-->
<div class="flex h-full min-h-0 w-full flex-col">
	<!-- Toolbar over the canvas — search + refresh + zoom + fit + physics. -->
	<div
		class="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2"
	>
		<div class="relative flex-1 min-w-[16rem] max-w-md">
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
				<div
					class="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-1"
				>
					<span class="rounded-sm bg-muted px-1.5 py-0.5 text-2xs tabular-nums text-muted-foreground">
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
				disabled={!network || loading}
			>
				<ZoomInIcon class="h-3.5 w-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="xs"
				onclick={() => zoomBy(0.8)}
				title="Zoom out"
				disabled={!network || loading}
			>
				<ZoomOutIcon class="h-3.5 w-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="xs"
				onclick={fit}
				title="Fit to view"
				disabled={!network || loading}
			>
				<MaximizeIcon class="h-3.5 w-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="xs"
				onclick={togglePhysics}
				title={physicsEnabled ? 'Freeze layout' : 'Resume physics'}
				disabled={!network || loading}
			>
				{#if physicsEnabled}
					<PauseIcon class="h-3.5 w-3.5" />
				{:else}
					<PlayIcon class="h-3.5 w-3.5" />
				{/if}
			</Button>
			<Button
				variant="ghost"
				size="xs"
				onclick={() => {
					lastFetchedIncidentId = null;
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
		<div class="relative flex-1 bg-muted/10">
			{#if graph.nodes.length > 0 && displayedNodes.length > 0}
				<VisNetwork
					nodes={displayedNodes}
					{edges}
					{options}
					className="h-full w-full"
					onClick={handleClick}
					onContextMenu={openContextMenu}
					onReady={handleReady}
				/>
			{/if}

			{#if contextMenu.open && contextMenu.node}
				<div
					class="absolute z-20 rounded-md border bg-background p-1 shadow-xl"
					style={`left:${contextMenu.x}px;top:${contextMenu.y}px;transform:translate(8px, 8px);`}
				>
					<Button
						variant="ghost"
						size="xs"
						class="w-full justify-start gap-2"
						onclick={() => {
							const node = nodeById.get(contextMenu.node?.id as string);
							if (node) openOrPivot(node);
							contextMenu = { open: false, x: 0, y: 0 };
						}}
					>
						<ExternalLinkIcon class="h-3 w-3" />
						{#if contextMenu.node.group === 'alert'}
							View alert #{getRawId(contextMenu.node.id as string)}
						{:else}
							Pivot alerts by {contextMenu.node.group}
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
				<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
					<div>No IOCs or assets on the member alerts yet.</div>
					<div class="text-xs">Add or import indicators on the alerts to see the graph populate.</div>
				</div>
			{:else if displayedNodes.length === 0}
				<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
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
							class="rounded-md border bg-muted/20 px-3 py-2 text-xs leading-relaxed [&_b]:font-semibold"
						>
							{@html DOMPurify.sanitize(selectedNode.title, {
								ALLOWED_TAGS: ['b', 'br', 'i', 'em', 'strong', 'span'],
								ALLOWED_ATTR: []
							})}
						</div>
					{/if}

					<div>
						<div class="mb-1.5 flex items-center justify-between text-2xs uppercase tracking-wide text-muted-foreground">
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
								<li class="px-2 py-1.5 text-xs text-muted-foreground">
									No connections.
								</li>
							{/each}
						</ul>
					</div>
				</div>

				<footer class="border-t px-4 py-3">
					<Button
						variant="default"
						size="xs"
						class="w-full justify-between"
						onclick={() => openOrPivot(selectedNode)}
					>
						{#if selectedNode.group === 'alert'}
							Open alert #{getRawId(selectedNode.id)}
						{:else}
							Pivot alerts by {selectedNode.group}
						{/if}
						<ExternalLinkIcon class="h-3 w-3" />
					</Button>
				</footer>
			</aside>
		{/if}
	</div>
</div>

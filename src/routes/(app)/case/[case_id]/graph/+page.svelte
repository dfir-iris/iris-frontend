<script lang="ts">
	import { mode } from 'mode-watcher';
	import type { IdType, Network, Options } from 'vis-network';
	import DOMPurify from 'dompurify';
	import {
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
	import iocSvg from 'lucide-static/icons/link.svg?raw';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { CaseTimelineService } from '$lib/services/case-timeline.service';
	import { CaseAssetsService } from '$lib/services/case-assets.service';
	import { CaseIocsService } from '$lib/services/case-iocs.service';
	import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';
	import { Button } from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input/input.svelte';
	import VisNetwork, {
		type VisNode,
		type VisEdge,
		svgToDataUrl,
		withStroke,
		applyAssetImageTheme
	} from '$lib/components/common/VisNetwork';
	import CaseWorkspace from '../components/CaseWorkspace.svelte';

	type Group = 'asset' | 'ioc';

	// Local node model used for the details rail. Mirrors what the
	// AlertClusterCorrelationGraph feeds into its rail so the two graphs
	// stay behaviourally consistent.
	type CaseGraphNode = {
		id: string;
		group: Group;
		label: string;
		title?: string;
		image?: string;
	};

	const caseId = $derived(Number(page.params.case_id));
	const isDark = $derived($mode === 'dark');
	const strokeColor = $derived(isDark ? '#f9fafb' : '#111827');

	// Per-group palette mirrors the alert-cluster graph so both graphs
	// read as one system. Only assets + iocs here — the case graph has
	// no alert nodes.
	const palette = $derived({
		asset: {
			icon: isDark ? '#34d399' : '#059669',
			border: isDark ? '#34d399' : '#047857',
			label: isDark ? '#6ee7b7' : '#065f46'
		},
		ioc: {
			icon: isDark ? '#60a5fa' : '#2563eb',
			border: isDark ? '#60a5fa' : '#1d4ed8',
			label: isDark ? '#93c5fd' : '#1e40af'
		}
	});

	const iocIcon = $derived(svgToDataUrl(withStroke(iocSvg, palette.ioc.icon)));

	let loading = $state(false);
	let error = $state<string | null>(null);
	let events = $state<CaseTimelineEvent[]>([]);
	let assets = $state<Asset[]>([]);
	let iocs = $state<Ioc[]>([]);
	let network = $state<Network | null>(null);

	// UX state
	let searchQuery = $state('');
	let visibleGroups = $state<Record<Group, boolean>>({ asset: true, ioc: true });
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

	const options = $derived({
		autoResize: true,
		layout: { improvedLayout: true, randomSeed: caseId },
		nodes: {
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
		// Same barnesHut tuning as the alert-cluster graph — predictable
		// long-range repulsion + `avoidOverlap` so assets/IOCs don't stack
		// on top of one another. Physics runs the initial layout then the
		// `stabilizationIterationsDone` handler in handleReady freezes it.
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

	// Build asset/ioc nodes + event-derived edges. This is the case-
	// specific data shape — same output type as the alert-cluster graph
	// so the rest of the pipeline (search, filter, details rail) is
	// identical.
	const graphData = $derived.by(() => {
		const graphEvents = events.filter((e) => e.event_in_graph !== false);
		const assetByName = new Map([
			...assets.map((a) => [a.asset_name, a] as [string, typeof a]),
			...assets.map(
				(a) => [`${a.asset_name} (${a.asset_type.asset_name})`, a] as [string, typeof a]
			)
		]);
		const iocByValue = new Map(iocs.map((i) => [i.ioc_value, i]));

		const nodeMap = new Map<string, CaseGraphNode>();
		const edgeMap = new Map<string, VisEdge>();

		for (const event of graphEvents) {
			const eventNodeIds: string[] = [];

			for (const ea of event.assets ?? []) {
				const asset = assetByName.get(ea.name);
				const nodeId = asset ? `a${asset.asset_id}` : `a-name-${ea.name}`;
				if (!nodeMap.has(nodeId)) {
					if (asset) {
						const iconFile =
							asset.asset_compromise_status_id === 1
								? asset.asset_type.asset_icon_compromised
								: asset.asset_type.asset_icon_not_compromised;
						const titleParts = [asset.asset_ip, asset.asset_description].filter(Boolean);
						nodeMap.set(nodeId, {
							id: nodeId,
							group: 'asset',
							label: asset.asset_name,
							title: titleParts.length ? titleParts.join(' — ') : undefined,
							image: `/static/assets/img/graph/${iconFile}`
						});
					} else {
						const titleParts = [ea.ip, ea.description].filter(Boolean);
						nodeMap.set(nodeId, {
							id: nodeId,
							group: 'asset',
							label: ea.name,
							title: titleParts.length ? titleParts.join(' — ') : undefined
						});
					}
				}
				eventNodeIds.push(nodeId);
			}

			for (const ei of event.iocs ?? []) {
				const ioc = iocByValue.get(ei.name);
				if (!ioc) continue;

				const nodeId = `b${ioc.ioc_id}`;
				if (!nodeMap.has(nodeId)) {
					nodeMap.set(nodeId, {
						id: nodeId,
						group: 'ioc',
						label: ioc.ioc_value,
						title: ioc.ioc_description ?? undefined
					});
				}
				eventNodeIds.push(nodeId);
			}

			for (let i = 0; i < eventNodeIds.length; i++) {
				for (let j = i + 1; j < eventNodeIds.length; j++) {
					const from = eventNodeIds[i];
					const to = eventNodeIds[j];
					const fromIsAsset = from.startsWith('a');
					const toIsAsset = to.startsWith('a');
					if (fromIsAsset === toIsAsset) continue;
					const key = [from, to].sort().join('|');
					if (!edgeMap.has(key)) {
						edgeMap.set(key, {
							from,
							to,
							title: `${event.event_date.slice(0, 10)} — ${event.event_title}`,
							dashes: true
						});
					}
				}
			}
		}

		return { nodes: [...nodeMap.values()], edges: [...edgeMap.values()] };
	});

	const groupCounts = $derived.by<Record<Group, number>>(() => {
		const counts: Record<Group, number> = { asset: 0, ioc: 0 };
		for (const n of graphData.nodes) {
			if (n.group === 'asset') counts.asset++;
			else if (n.group === 'ioc') counts.ioc++;
		}
		return counts;
	});

	const matches = $derived.by<Set<string>>(() => {
		const q = searchQuery.trim().toLowerCase();
		const hits = new Set<string>();
		for (const n of graphData.nodes) {
			if (!visibleGroups[n.group]) continue;
			const label = (n.label ?? '').toLowerCase();
			const title = (n.title ?? '').toLowerCase();
			if (!q || label.includes(q) || title.includes(q)) hits.add(n.id);
		}
		return hits;
	});

	const searchHitCount = $derived(searchQuery.trim() ? matches.size : 0);
	const hasActiveFilter = $derived(
		searchQuery.trim().length > 0 || !visibleGroups.asset || !visibleGroups.ioc
	);

	const orderedMatches = $derived.by<string[]>(() => {
		if (!searchQuery.trim()) return [];
		return graphData.nodes.filter((n) => matches.has(n.id)).map((n) => n.id);
	});
	let matchCursor = $state(0);

	const dimStroke = $derived(isDark ? '#334155' : '#cbd5e1');
	const dimFont = $derived(isDark ? '#475569' : '#94a3b8');
	const selectedRing = $derived(isDark ? '#60a5fa' : '#2563eb');

	const shortLabel = (label: string | undefined) => {
		const v = label ?? '';
		return v.length > 42 ? `${v.slice(0, 40)}…` : v;
	};

	const nodes = $derived(
		graphData.nodes.map((node) => {
			const isMatch = matches.has(node.id);
			const groupPalette = palette[node.group];

			const borderColor = isMatch ? groupPalette.border : dimStroke;
			const fontColor = isMatch ? groupPalette.label : dimFont;

			const base: VisNode = {
				id: node.id,
				group: node.group,
				label: shortLabel(node.label),
				title: node.title,
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

			if (node.group === 'ioc') {
				return {
					...base,
					shape: 'circularImage',
					image: iocIcon,
					size: 20
				} as VisNode;
			}
			if (node.group === 'asset' && typeof node.image === 'string') {
				return {
					...base,
					shape: 'circularImage',
					image: applyAssetImageTheme(node.image, isDark),
					size: 22
				} as VisNode;
			}
			// Asset without a resolved icon (name-only, pulled from event).
			return { ...base, shape: 'box' } as VisNode;
		})
	);

	const visibleNodeIds = $derived(
		new Set(graphData.nodes.filter((n) => visibleGroups[n.group]).map((n) => n.id))
	);

	const edges = $derived(
		graphData.edges
			.filter((e) => visibleNodeIds.has(e.from as string) && visibleNodeIds.has(e.to as string))
			.map((e) => {
				const bothHit = matches.has(e.from as string) && matches.has(e.to as string);
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

	const displayedNodes = $derived(
		nodes.filter((n) => visibleGroups[(n.group as Group) ?? 'asset'])
	);

	const nodeById = $derived.by(() => {
		const m = new Map<string, CaseGraphNode>();
		for (const n of graphData.nodes) m.set(n.id, n);
		return m;
	});

	const selectedNode = $derived(selectedNodeId ? (nodeById.get(selectedNodeId) ?? null) : null);

	const selectedNeighbours = $derived.by<CaseGraphNode[]>(() => {
		if (!selectedNodeId) return [];
		const neighbourIds = new Set<string>();
		for (const e of graphData.edges) {
			if (e.from === selectedNodeId) neighbourIds.add(e.to as string);
			else if (e.to === selectedNodeId) neighbourIds.add(e.from as string);
		}
		const out: CaseGraphNode[] = [];
		for (const id of neighbourIds) {
			const n = nodeById.get(id);
			if (n) out.push(n);
		}
		return out.sort((a, b) => {
			const order = { asset: 0, ioc: 1 } as const;
			return order[a.group] - order[b.group];
		});
	});

	// Push selection into vis-network without rebuilding the dataset.
	// Rebuilding would drop layout positions and re-trigger stabilization
	// on every click — same bug the alert-cluster graph avoids.
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
		autoFreezeArmed = false;
	};

	const handleSearchKeydown = (e: KeyboardEvent) => {
		if (e.key !== 'Enter') return;
		if (orderedMatches.length === 0) return;
		e.preventDefault();
		matchCursor = (matchCursor + 1) % orderedMatches.length;
		focusNode(orderedMatches[matchCursor]);
	};

	$effect(() => {
		void searchQuery;
		matchCursor = 0;
	});

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

	const openNode = (node: CaseGraphNode) => {
		if (node.group === 'asset') {
			const numericId = node.id.match(/^a(\d+)$/)?.[1];
			if (!numericId) return;
			goto(`/case/${caseId}/assets/${numericId}`);
		} else if (node.group === 'ioc') {
			goto(`/case/${caseId}/iocs/${node.id.slice(1)}`);
		}
	};

	const toggleGroup = (g: Group) => {
		visibleGroups = { ...visibleGroups, [g]: !visibleGroups[g] };
	};

	const handleReady = (n: Network | null) => {
		network = n;
		if (!n) return;
		n.on('stabilizationIterationsDone', () => {
			if (!autoFreezeArmed) return;
			physicsEnabled = false;
		});
	};

	const load = async () => {
		loading = true;
		error = null;
		contextMenu = { open: false, x: 0, y: 0 };
		selectedNodeId = null;
		// Fresh data means a fresh layout pass; re-arm auto-freeze so
		// vis-network stabilizes the new node set, then freezes again.
		physicsEnabled = true;
		autoFreezeArmed = true;

		const [eventsRes, assetsRes, iocsRes] = await Promise.all([
			CaseTimelineService.listEvents(caseId, {}, { fetch }),
			CaseAssetsService.list(caseId, { per_page: 500 }, { fetch }),
			CaseIocsService.list(caseId, { per_page: 500 }, { fetch })
		]);

		if (
			!eventsRes.ok ||
			!assetsRes.ok ||
			!iocsRes.ok ||
			typeof eventsRes.data === 'string' ||
			typeof assetsRes.data === 'string' ||
			typeof iocsRes.data === 'string'
		) {
			error = 'Failed to load graph data';
			loading = false;
			return;
		}

		events = eventsRes.data?.timeline ?? eventsRes.data?.tim ?? [];
		assets = assetsRes.data?.data ?? [];
		iocs = iocsRes.data?.data ?? [];
		loading = false;
	};

	$effect(() => {
		load();
	});
</script>

<svelte:head>
	<title>#{page.params.case_id} - Graph</title>
</svelte:head>

<CaseWorkspace>
	<div class="flex h-full min-h-0 w-full flex-col">
		<!-- Toolbar: search + filter chips + zoom + fit + physics + refresh. -->
		<div class="flex flex-wrap items-center gap-2 border-b bg-muted/20 px-4 py-2">
			<div class="relative flex-1 min-w-[16rem] max-w-md">
				<SearchIcon
					class="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					bind:value={searchQuery}
					onkeydown={handleSearchKeydown}
					placeholder="Search assets, IOCs…  (Enter to cycle)"
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

			<div class="flex items-center gap-1">
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
					onclick={load}
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
				{#if graphData.nodes.length > 0 && displayedNodes.length > 0}
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
								if (node) openNode(node);
								contextMenu = { open: false, x: 0, y: 0 };
							}}
						>
							<ExternalLinkIcon class="h-3 w-3" />
							View {contextMenu.node.group}
							{contextMenu.node.label}
						</Button>
					</div>
				{/if}

				{#if loading}
					<div
						class="absolute inset-0 flex items-center justify-center bg-background/40 text-sm text-muted-foreground backdrop-blur-sm"
					>
						<RefreshCwIcon class="mr-2 h-4 w-4 animate-spin" />
						Loading graph…
					</div>
				{:else if error}
					<div class="absolute inset-0 flex items-center justify-center text-sm text-destructive">
						{error}
					</div>
				{:else if !graphData.nodes.length}
					<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-sm text-muted-foreground">
						<div>No graph data.</div>
						<div class="text-xs">Add assets or IOCs to timeline events and enable "Display in graph".</div>
					</div>
				{:else if displayedNodes.length === 0}
					<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
						<div>Every node is currently filtered out.</div>
						<Button
							variant="outline"
							size="xs"
							onclick={() => {
								visibleGroups = { asset: true, ioc: true };
								searchQuery = '';
							}}
						>
							Reset filters
						</Button>
					</div>
				{/if}

				<!-- Legend, bottom-left over the canvas. -->
				<div
					class="pointer-events-none absolute bottom-2 left-2 hidden gap-3 rounded-md border bg-background/80 px-3 py-1.5 text-2xs text-muted-foreground shadow-sm backdrop-blur-sm md:flex"
				>
					<span class="inline-flex items-center gap-1">
						<HardDriveIcon class="h-3 w-3" /> Asset
					</span>
					<span class="inline-flex items-center gap-1">
						<FingerprintIcon class="h-3 w-3" /> IOC
					</span>
				</div>

				{#if graphData.nodes.length > 0 && !hasActiveFilter && !selectedNodeId}
					<div
						class="pointer-events-none absolute left-2 top-2 max-w-xs rounded-md border bg-background/80 px-2.5 py-1.5 text-2xs text-muted-foreground shadow-sm backdrop-blur-sm"
					>
						Click a node to see details. Edges link assets and IOCs sharing a timeline event.
					</div>
				{/if}
			</div>

			{#if selectedNode}
				<aside
					class="flex w-80 shrink-0 flex-col overflow-hidden border-l bg-card"
					aria-label="Selected node details"
				>
					<header class="flex items-center gap-2 border-b px-4 py-3">
						<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
							{#if selectedNode.group === 'ioc'}
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
									{selectedNode.group === 'asset' ? 'Linked IOCs' : 'Linked assets'}
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
											{#if n.group === 'ioc'}
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
							onclick={() => openNode(selectedNode)}
						>
							Open {selectedNode.group}
							<ExternalLinkIcon class="h-3 w-3" />
						</Button>
					</footer>
				</aside>
			{/if}
		</div>
	</div>
</CaseWorkspace>

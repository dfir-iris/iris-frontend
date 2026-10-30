<!--
  War-room "Graph" tab: the investigation graphs of the attached cases in
  one read-only canvas (§4.10). Each readable case is a box holding its
  objects; a case the caller cannot read is a single locked node. Dashed
  fuchsia "same as" links join the same IOC or managed asset across cases.
  Edits happen in the case graph, linked from the detail panel.
-->
<script lang="ts">
	import { page } from '$app/state';
	import { mode } from 'mode-watcher';
	import type { Core } from 'cytoscape';
	import {
		AlertTriangleIcon,
		ChevronDownIcon,
		LayersIcon,
		LayoutGridIcon,
		LoaderCircleIcon,
		LockIcon,
		RefreshCwIcon,
		SearchIcon,
		WaypointsIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import {
		CytoscapeGraph,
		paletteHex,
		runLayout,
		type CyEdgeEvent,
		type CyNodeEvent
	} from '$lib/components/common/CytoscapeGraph';
	import { CaseGraphService } from '$lib/services/case-graph.service';
	import type { GraphEdge, WarRoomGraph } from '$lib/types/resources/case-graph';
	import { useWarRoomLive } from '$lib/contexts/war-room.context.svelte';
	import WarRoomGraphDetail from './components/WarRoomGraphDetail.svelte';
	import {
		buildWarRoomElements,
		caseNodeKey,
		searchWarRoomNodes,
		WAR_ROOM_GRAPH_INCLUDES,
		WAR_ROOM_INCLUDE_LABEL,
		warRoomGraphStylesheet,
		type WarRoomGraphInclude
	} from './lib/war-room-graph';

	const warRoomId = $derived(Number(page.params.war_room_id));
	const isDark = $derived($mode === 'dark');

	let graph = $state<WarRoomGraph | null>(null);
	let loading = $state(true);
	let refreshing = $state(false);
	let error = $state<string | null>(null);

	let include = $state<WarRoomGraphInclude[]>(['events']);
	let hiddenCases = $state<Set<number>>(new Set());
	let expandedFanouts = $state<Set<string>>(new Set());
	const expandedBundles = new Set<string>();
	let query = $state('');

	let selectedNode = $state<string | null>(null);
	let selectedEdges = $state<string[]>([]);

	let cy = $state<Core | null>(null);
	let layoutRunning = $state(false);

	let loadSeq = 0;
	const load = async (silent = false) => {
		const id = warRoomId;
		if (!id) return;
		const seq = ++loadSeq;
		if (silent) refreshing = true;
		else loading = true;
		const res = await CaseGraphService.getWarRoomGraph(id, { include: [...include] });
		if (seq !== loadSeq) return;
		if (res.ok && res.data && typeof res.data === 'object') {
			graph = res.data;
			error = null;
		} else if (!silent || !graph) {
			error =
				typeof res.data === 'string'
					? res.data
					: (res.error?.message ?? 'The war-room graph could not be loaded');
		}
		loading = false;
		refreshing = false;
	};

	// (Re)load when the war room or the included kinds change.
	$effect(() => {
		void warRoomId;
		void include;
		void load();
	});

	// Graph edits are not pushed to the war room; changes to the attached
	// cases, their scope, tasks and timelines are.
	useWarRoomLive(['cases', 'scope', 'tasks', 'timelines'], () => load(true));

	const matches = $derived(graph ? searchWarRoomNodes(graph.nodes, query) : null);

	const built = $derived(
		graph
			? buildWarRoomElements({
					graph,
					isDark,
					hiddenCases,
					expandedFanouts,
					expandedBundles,
					matches
				})
			: null
	);
	const cases = $derived(built?.cases ?? []);
	const stylesheet = $derived(warRoomGraphStylesheet(isDark));

	const nodeByKey = $derived(new Map((graph?.nodes ?? []).map((n) => [n.key, n])));
	const edgeByKey = $derived(new Map((graph?.edges ?? []).map((e) => [e.key, e])));
	const detailNode = $derived(selectedNode ? (nodeByKey.get(selectedNode) ?? null) : null);
	const detailEdges = $derived(
		selectedEdges.map((k) => edgeByKey.get(k)).filter((e): e is GraphEdge => !!e)
	);

	const clearSelection = () => {
		selectedNode = null;
		selectedEdges = [];
	};

	// Drop a selection that a refresh or a filter removed.
	$effect(() => {
		if (selectedNode && !nodeByKey.has(selectedNode)) selectedNode = null;
		if (selectedEdges.length && !detailEdges.length) selectedEdges = [];
	});

	const focusNode = (key: string) => {
		const n = nodeByKey.get(key);
		if (!n) return;
		const caseId = n.case_id;
		if (typeof caseId === 'number' && hiddenCases.has(caseId)) {
			const next = new Set(hiddenCases);
			next.delete(caseId);
			hiddenCases = next;
		}
		selectedEdges = [];
		selectedNode = key;
		// Folded IOCs are unfolded to be shown.
		const folded = [...(built?.fanouts ?? [])].find(([, f]) => f.iocs.includes(key));
		if (folded) expandedFanouts = new Set([...expandedFanouts, folded[1].asset]);
		queueMicrotask(() => {
			const el = cy?.getElementById(key);
			if (!cy || !el || el.empty()) return;
			cy.elements(':selected').unselect();
			el.select();
			cy.animate({ center: { eles: el } }, { duration: 300 });
		});
	};

	const onTapNode = (e: CyNodeEvent) => {
		const id = e.target.id();
		const fan = built?.fanouts.get(id);
		if (fan) {
			expandedFanouts = new Set([...expandedFanouts, fan.asset]);
			return;
		}
		selectedEdges = [];
		selectedNode = id;
	};

	const onTapEdge = (e: CyEdgeEvent) => {
		const id = e.target.id();
		const members = built?.bundles.get(id);
		selectedNode = null;
		if (members) {
			selectedEdges = members;
			return;
		}
		const data = e.target.data('members');
		selectedEdges = Array.isArray(data) ? (data as string[]) : [id];
	};

	const relayout = async () => {
		if (!cy || layoutRunning) return;
		layoutRunning = true;
		try {
			await runLayout(cy, 'fcose');
		} finally {
			layoutRunning = false;
		}
	};

	const toggleInclude = (value: WarRoomGraphInclude, on: boolean) => {
		include = on ? [...include, value] : include.filter((i) => i !== value);
	};

	const toggleCase = (caseId: number) => {
		const next = new Set(hiddenCases);
		if (next.has(caseId)) next.delete(caseId);
		else next.add(caseId);
		hiddenCases = next;
	};

	const readableCount = $derived(cases.filter((c) => c.accessible).length);
	const sameAsCount = $derived(
		(graph?.edges ?? []).filter((e) => e.origin === 'cross_case').length
	);
</script>

<div class="flex h-full flex-col">
	<div class="flex flex-wrap items-center gap-2 border-b px-3 py-2">
		<div class="relative w-56">
			<SearchIcon
				class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				bind:value={query}
				placeholder="Search objects…"
				class="h-7 pl-7 text-xs"
				aria-label="Search objects"
			/>
		</div>
		{#if matches}
			<span class="text-xs text-muted-foreground">
				{matches.size} match{matches.size === 1 ? '' : 'es'}
			</span>
		{/if}

		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="xs" title="Objects shown">
						<LayersIcon class="mr-1 h-3.5 w-3.5" />Show
						<ChevronDownIcon class="ml-0.5 h-3 w-3" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-56">
				<DropdownMenu.Label>Always shown: assets, IOCs, free nodes</DropdownMenu.Label>
				<DropdownMenu.Separator />
				{#each WAR_ROOM_GRAPH_INCLUDES as i (i)}
					<DropdownMenu.CheckboxItem
						checked={include.includes(i)}
						onCheckedChange={(v) => toggleInclude(i, v)}
						closeOnSelect={false}
					>
						{WAR_ROOM_INCLUDE_LABEL[i]}
					</DropdownMenu.CheckboxItem>
				{/each}
			</DropdownMenu.Content>
		</DropdownMenu.Root>

		<Button
			variant="outline"
			size="xs"
			onclick={relayout}
			disabled={!cy || layoutRunning}
			title="Lay the graph out again"
		>
			{#if layoutRunning}
				<LoaderCircleIcon class="mr-1 h-3.5 w-3.5 animate-spin" />
			{:else}
				<LayoutGridIcon class="mr-1 h-3.5 w-3.5" />
			{/if}
			Layout
		</Button>
		<Button
			variant="ghost"
			size="xs"
			onclick={() => load(true)}
			disabled={loading || refreshing}
			title="Reload the graph"
			aria-label="Reload the graph"
		>
			<RefreshCwIcon class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}" />
		</Button>

		{#if graph}
			<span class="ml-auto text-xs text-muted-foreground">
				{graph.meta.node_count} nodes · {graph.meta.edge_count} relations · {readableCount}/{cases.length}
				cases readable{#if sameAsCount}
					· {sameAsCount} cross-case link{sameAsCount === 1 ? '' : 's'}{/if}
			</span>
		{/if}
	</div>

	{#if graph?.meta.warning}
		<div
			class="flex items-center gap-2 border-b bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300"
			role="status"
		>
			<AlertTriangleIcon class="h-3.5 w-3.5 shrink-0" />
			{graph.meta.warning}
		</div>
	{/if}

	<div class="flex min-h-0 flex-1">
		<div class="relative min-w-0 flex-1">
			{#if loading && !graph}
				<div class="flex h-full items-center justify-center p-8">
					<Skeleton class="h-full w-full" />
				</div>
			{:else if error && !graph}
				<div class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
					<AlertTriangleIcon class="h-8 w-8 text-destructive" />
					<p class="text-sm">{error}</p>
					<Button variant="outline" size="sm" onclick={() => load()}>Try again</Button>
				</div>
			{:else if graph && !cases.length}
				<div
					class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground"
				>
					<WaypointsIcon class="h-8 w-8" />
					<p class="text-sm">No case is attached to this war room yet.</p>
					<Button variant="outline" size="sm" href={`/war-rooms/${warRoomId}/cases`}>
						Attach cases
					</Button>
				</div>
			{:else if built}
				<CytoscapeGraph
					elements={built.elements}
					{stylesheet}
					boxSelectionEnabled={false}
					onReady={(c) => (cy = c)}
					{onTapNode}
					{onTapEdge}
					onTapCanvas={clearSelection}
				>
					<div
						class="absolute bottom-3 left-3 z-10 max-h-[45%] w-60 overflow-y-auto rounded-md border bg-background/95 p-2 text-xs shadow-sm backdrop-blur"
						aria-label="Cases"
					>
						<p class="mb-1 px-1 font-medium text-muted-foreground">Cases</p>
						<ul class="space-y-0.5">
							{#each cases as c (c.id)}
								<li class="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent">
									{#if c.accessible}
										<input
											type="checkbox"
											class="h-3.5 w-3.5 shrink-0 accent-primary"
											checked={!hiddenCases.has(c.id)}
											onchange={() => toggleCase(c.id)}
											aria-label={`Show the objects of case #${c.id}`}
										/>
									{:else}
										<LockIcon class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
									{/if}
									<span
										class="h-2.5 w-2.5 shrink-0 rounded-sm"
										style:background-color={paletteHex(c.accessible ? c.color : 'slate', isDark)}
									></span>
									<button
										type="button"
										class="min-w-0 flex-1 truncate text-left {c.accessible
											? ''
											: 'italic text-muted-foreground'}"
										title={c.accessible ? `#${c.id} ${c.name}` : 'You cannot read this case'}
										onclick={() => focusNode(caseNodeKey(c.id))}
									>
										#{c.id}
										{c.name}
									</button>
									{#if c.accessible}
										<span class="shrink-0 tabular-nums text-muted-foreground">{c.nodeCount}</span>
									{/if}
								</li>
							{/each}
						</ul>
						{#if sameAsCount}
							<p class="mt-2 flex items-center gap-2 border-t px-1 pt-2 text-muted-foreground">
								<span
									class="w-5 shrink-0 border-t-2 border-dashed"
									style:border-color={paletteHex('fuchsia', isDark)}
								></span>
								Same object in two cases
							</p>
						{/if}
					</div>
				</CytoscapeGraph>
			{/if}
		</div>

		{#if graph && (detailNode || detailEdges.length)}
			<WarRoomGraphDetail
				{graph}
				{cases}
				{isDark}
				node={detailNode}
				edges={detailEdges}
				onSelectNode={focusNode}
				onClose={clearSelection}
			/>
		{/if}
	</div>
</div>

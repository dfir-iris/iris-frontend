<!--
  Case graph toolbar: search, data to include, layout, overlays, display
  options, history, panels. Features plug their own controls in through
  `graph.registerToolbarItem` (slots `start` and `end`).
-->
<script lang="ts">
	import {
		ChevronDownIcon,
		EyeIcon,
		HelpCircleIcon,
		LayersIcon,
		LayoutGridIcon,
		ListIcon,
		LoaderCircleIcon,
		LockIcon,
		LockOpenIcon,
		MapIcon,
		MaximizeIcon,
		PanelLeftIcon,
		PlusIcon,
		Redo2Icon,
		RefreshCwIcon,
		RotateCcwIcon,
		RouteIcon,
		SearchIcon,
		Undo2Icon,
		XIcon
	} from 'lucide-svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Popover from '$lib/components/ui/popover';
	import { Button } from '$lib/components/ui/button';
	import { GRAPH_INCLUDES, type GraphInclude } from '$lib/types/resources/case-graph';
	import type { CaseGraphState, GraphToolbarItem, LayoutChoice } from '../lib/graph-state.svelte';
	import type { GraphActions } from '../lib/actions';
	import { OVERLAY_LABEL, type OverlayToggles } from '../lib/elements';
	import { GROUPING_LABEL, type GroupingMode } from '../lib/grouping';
	import { GRAPH_SHORTCUTS } from '../lib/shortcuts';

	interface Props {
		graph: CaseGraphState;
		canEdit: boolean;
		actions: GraphActions;
		showPalette: boolean;
		showLegend: boolean;
		showHelp: boolean;
		searchInput?: HTMLInputElement | null;
		onUndo: () => void;
		onRedo: () => void;
	}

	let {
		graph,
		canEdit,
		actions,
		showPalette = $bindable(),
		showLegend = $bindable(),
		showHelp = $bindable(),
		searchInput = $bindable(null),
		onUndo,
		onRedo
	}: Props = $props();

	const INCLUDE_LABEL: Record<GraphInclude, string> = {
		events: 'Timeline events',
		evidences: 'Evidences',
		tasks: 'Tasks',
		notes: 'Notes',
		alerts: 'Alerts',
		cross_case: 'Other cases',
		suggestions: 'Suggestions'
	};

	/** `suggestions` is fetched by the suggestions panel, not toggled here. */
	const INCLUDE_CHOICES = GRAPH_INCLUDES.filter((i) => i !== 'suggestions');

	const LAYOUT_LABEL: Record<string, string> = {
		fcose: 'Force-directed',
		dagre: 'Hierarchical',
		chronological: 'Chronological',
		radial: 'Radial (around the selection)',
		grid: 'Grid'
	};

	const GROUPINGS = Object.keys(GROUPING_LABEL) as GroupingMode[];

	const layoutLabel = (l: LayoutChoice) =>
		l.startsWith('grouped:')
			? `Grouped by ${GROUPING_LABEL[l.split(':')[1] as GroupingMode].toLowerCase()}`
			: LAYOUT_LABEL[l];

	const toolbarItems = (slot: 'start' | 'end'): GraphToolbarItem[] =>
		[...graph.toolbarItems.values()]
			.filter((i) => (i.slot ?? 'end') === slot)
			.sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

	const startItems = $derived(toolbarItems('start'));
	const endItems = $derived(toolbarItems('end'));

	const toggleInclude = (i: GraphInclude, on: boolean) => {
		const next = on ? [...graph.include, i] : graph.include.filter((x) => x !== i);
		void actions.run(() => graph.setInclude([...new Set(next)]));
	};

	const setOverlay = (k: keyof OverlayToggles, on: boolean) => {
		graph.overlays = { ...graph.overlays, [k]: on };
		graph.markDirty();
	};

	const setDisplay = (
		k: 'bundleEdges' | 'showUnlinked' | 'showPending' | 'showRejected' | 'showMinimap',
		on: boolean
	) => {
		graph[k] = on;
		graph.markDirty();
	};

	const runLayout = (l: LayoutChoice) => {
		if (graph.locked) return;
		void actions.run(() => graph.applyLayout(l));
	};

	const onSearchKey = (e: KeyboardEvent) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			graph.cycleMatch(e.shiftKey);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			graph.setQuery('');
			(e.currentTarget as HTMLInputElement).blur();
		}
	};

	const matchInfo = $derived(
		graph.matches === null
			? ''
			: graph.matches.length
				? `${graph.activeMatchIndex >= 0 ? graph.activeMatchIndex + 1 : '–'}/${graph.matches.length}`
				: '0'
	);

	const hiddenCount = $derived(graph.hidden.size);
</script>

<div class="flex flex-wrap items-center gap-1.5 border-b bg-muted/20 px-3 py-1.5" role="toolbar">
	<div class="relative">
		<SearchIcon
			class="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground"
		/>
		<input
			bind:this={searchInput}
			class="h-7 w-72 rounded-md border border-input bg-background pl-7 pr-14 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
			placeholder="Search — kind:ioc type:ip tag:c2 compromised:true flag:isolated"
			value={graph.query}
			oninput={(e) => graph.setQuery((e.currentTarget as HTMLInputElement).value)}
			onkeydown={onSearchKey}
			aria-label="Search the graph"
			title="Enter / Shift+Enter: next / previous match"
		/>
		{#if graph.query}
			<span class="absolute right-6 top-1.5 text-[11px] tabular-nums text-muted-foreground">
				{matchInfo}
			</span>
			<button
				type="button"
				class="absolute right-1.5 top-1.5 rounded text-muted-foreground hover:text-foreground"
				aria-label="Clear the search"
				onclick={() => graph.setQuery('')}
			>
				<XIcon class="h-3.5 w-3.5" />
			</button>
		{/if}
	</div>

	{#each startItems as item (item.id)}
		<item.component {graph} />
	{/each}

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="xs" title="Kinds of objects shown">
					<LayersIcon class="mr-1 h-3.5 w-3.5" />Data
					{#if graph.include.length}
						<span class="ml-1 rounded-full bg-primary px-1 text-[10px] text-primary-foreground">
							{graph.include.length}
						</span>
					{/if}
					<ChevronDownIcon class="ml-0.5 h-3 w-3" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="w-56">
			<DropdownMenu.Label>Always shown: assets, IOCs, free nodes</DropdownMenu.Label>
			<DropdownMenu.Separator />
			{#each INCLUDE_CHOICES as i (i)}
				<DropdownMenu.CheckboxItem
					checked={graph.include.includes(i)}
					onCheckedChange={(v) => toggleInclude(i, v)}
					closeOnSelect={false}
				>
					{INCLUDE_LABEL[i]}
				</DropdownMenu.CheckboxItem>
			{/each}
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="xs" title="Layout">
					{#if graph.layoutRunning}
						<LoaderCircleIcon class="mr-1 h-3.5 w-3.5 animate-spin" />
					{:else}
						<LayoutGridIcon class="mr-1 h-3.5 w-3.5" />
					{/if}
					{layoutLabel(graph.layout)}
					<ChevronDownIcon class="ml-0.5 h-3 w-3" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="w-60">
			{#if graph.locked}
				<DropdownMenu.Label class="text-xs font-normal text-muted-foreground">
					The layout is locked — unlock it to rearrange.
				</DropdownMenu.Label>
			{/if}
			{#each Object.keys(LAYOUT_LABEL) as l (l)}
				<DropdownMenu.Item disabled={graph.locked} onclick={() => runLayout(l as LayoutChoice)}>
					<span class="w-3">{graph.layout === l ? '•' : ''}</span>{LAYOUT_LABEL[l]}
				</DropdownMenu.Item>
			{/each}
			<DropdownMenu.Sub>
				<DropdownMenu.SubTrigger disabled={graph.locked}>
					<span class="w-3">{graph.layout.startsWith('grouped:') ? '•' : ''}</span>Grouped by
				</DropdownMenu.SubTrigger>
				<DropdownMenu.SubContent>
					{#each GROUPINGS as g (g)}
						<DropdownMenu.Item onclick={() => runLayout(`grouped:${g}`)}>
							<span class="w-3">{graph.layout === `grouped:${g}` ? '•' : ''}</span>{GROUPING_LABEL[
								g
							]}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.SubContent>
			</DropdownMenu.Sub>
			<DropdownMenu.Separator />
			<DropdownMenu.Item disabled={graph.locked} onclick={() => runLayout(graph.layout)}>
				<RotateCcwIcon class="mr-2 h-3.5 w-3.5" />Re-run layout
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	<Button
		variant={graph.locked ? 'default' : 'outline'}
		size="xs"
		title={graph.locked ? 'Layout locked — nodes cannot be moved' : 'Lock the layout'}
		aria-pressed={graph.locked}
		onclick={() => graph.setLocked(!graph.locked)}
	>
		{#if graph.locked}
			<LockIcon class="h-3.5 w-3.5" />
		{:else}
			<LockOpenIcon class="h-3.5 w-3.5" />
		{/if}
	</Button>

	<DropdownMenu.Root>
		<DropdownMenu.Trigger>
			{#snippet child({ props })}
				<Button {...props} variant="outline" size="xs" title="Overlays and display options">
					<EyeIcon class="mr-1 h-3.5 w-3.5" />View
					<ChevronDownIcon class="ml-0.5 h-3 w-3" />
				</Button>
			{/snippet}
		</DropdownMenu.Trigger>
		<DropdownMenu.Content align="start" class="w-64">
			<DropdownMenu.Label>Overlays</DropdownMenu.Label>
			{#each Object.keys(OVERLAY_LABEL) as k (k)}
				<DropdownMenu.CheckboxItem
					checked={graph.overlays[k as keyof OverlayToggles]}
					onCheckedChange={(v) => setOverlay(k as keyof OverlayToggles, v)}
					closeOnSelect={false}
				>
					{OVERLAY_LABEL[k as keyof OverlayToggles]}
				</DropdownMenu.CheckboxItem>
			{/each}
			<DropdownMenu.Separator />
			<DropdownMenu.Label>Relations</DropdownMenu.Label>
			<DropdownMenu.CheckboxItem
				checked={graph.bundleEdges}
				onCheckedChange={(v) => setDisplay('bundleEdges', v)}
				closeOnSelect={false}
			>
				Bundle parallel relations
			</DropdownMenu.CheckboxItem>
			<DropdownMenu.CheckboxItem
				checked={graph.showPending}
				onCheckedChange={(v) => setDisplay('showPending', v)}
				closeOnSelect={false}
			>
				Show pending (to review)
			</DropdownMenu.CheckboxItem>
			<DropdownMenu.CheckboxItem
				checked={graph.showRejected}
				onCheckedChange={(v) => setDisplay('showRejected', v)}
				closeOnSelect={false}
			>
				Show rejected
			</DropdownMenu.CheckboxItem>
			<DropdownMenu.Separator />
			<DropdownMenu.Label>Objects</DropdownMenu.Label>
			<DropdownMenu.CheckboxItem
				checked={graph.showUnlinked}
				onCheckedChange={(v) => setDisplay('showUnlinked', v)}
				closeOnSelect={false}
			>
				Show assets / IOCs without relations
			</DropdownMenu.CheckboxItem>
			<div class="flex items-center gap-2 px-2 py-1.5 text-sm">
				<label for="graph-fanout" class="flex-1">Fold IOC fan-outs above</label>
				<input
					id="graph-fanout"
					type="number"
					min="0"
					max="99"
					class="h-7 w-14 rounded border bg-background px-1 text-xs"
					value={graph.fanoutThreshold}
					onchange={(e) => {
						const v = Number((e.currentTarget as HTMLInputElement).value);
						graph.fanoutThreshold = Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 8;
						graph.markDirty();
					}}
					title="0 never folds"
				/>
			</div>
			{#if hiddenCount}
				<DropdownMenu.Item onclick={() => graph.unhideAll()}>
					<EyeIcon class="mr-2 h-3.5 w-3.5" />Show the {hiddenCount} hidden object{hiddenCount > 1
						? 's'
						: ''}
				</DropdownMenu.Item>
			{/if}
			<DropdownMenu.Separator />
			<DropdownMenu.CheckboxItem
				checked={graph.showMinimap}
				onCheckedChange={(v) => setDisplay('showMinimap', v)}
				closeOnSelect={false}
			>
				Minimap
			</DropdownMenu.CheckboxItem>
			<DropdownMenu.Item onclick={() => graph.resetView()}>
				<RotateCcwIcon class="mr-2 h-3.5 w-3.5" />Reset the view
			</DropdownMenu.Item>
		</DropdownMenu.Content>
	</DropdownMenu.Root>

	{#if canEdit}
		<DropdownMenu.Root>
			<DropdownMenu.Trigger>
				{#snippet child({ props })}
					<Button {...props} variant="outline" size="xs" title="Add to the graph">
						<PlusIcon class="mr-1 h-3.5 w-3.5" />Add
						<ChevronDownIcon class="ml-0.5 h-3 w-3" />
					</Button>
				{/snippet}
			</DropdownMenu.Trigger>
			<DropdownMenu.Content align="start" class="w-56">
				<DropdownMenu.Item onclick={() => actions.addExisting()}>
					Existing asset / IOC…
				</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => actions.createObject('asset')}
					>New asset…</DropdownMenu.Item
				>
				<DropdownMenu.Item onclick={() => actions.createObject('ioc')}>New IOC…</DropdownMenu.Item>
				<DropdownMenu.Item onclick={() => actions.createFreeNode()}>Free node…</DropdownMenu.Item>
				<DropdownMenu.Separator />
				<DropdownMenu.Item onclick={() => actions.paste()}>Paste indicators…</DropdownMenu.Item>
			</DropdownMenu.Content>
		</DropdownMenu.Root>
	{/if}

	<div class="mx-1 h-5 w-px bg-border"></div>

	<Button
		variant="ghost"
		size="xs"
		onclick={onUndo}
		disabled={!graph.canUndo}
		title={graph.undoLabel ? `Undo: ${graph.undoLabel} (Ctrl+Z)` : 'Nothing to undo'}
		aria-label="Undo"
	>
		<Undo2Icon class="h-3.5 w-3.5" />
	</Button>
	<Button
		variant="ghost"
		size="xs"
		onclick={onRedo}
		disabled={!graph.canRedo}
		title={graph.redoLabel ? `Redo: ${graph.redoLabel} (Ctrl+Shift+Z)` : 'Nothing to redo'}
		aria-label="Redo"
	>
		<Redo2Icon class="h-3.5 w-3.5" />
	</Button>
	<Button variant="ghost" size="xs" onclick={() => graph.fit()} title="Fit (F)" aria-label="Fit">
		<MaximizeIcon class="h-3.5 w-3.5" />
	</Button>

	<div class="ml-auto flex items-center gap-1">
		{#each endItems as item (item.id)}
			<item.component {graph} />
		{/each}
		<Button
			variant={showPalette ? 'secondary' : 'ghost'}
			size="xs"
			onclick={() => (showPalette = !showPalette)}
			title="Objects off the canvas"
			aria-pressed={showPalette}
		>
			<PanelLeftIcon class="mr-1 h-3.5 w-3.5" />{graph.offCanvas.length}
		</Button>
		<Button
			variant={graph.rail?.type === 'paths' ? 'secondary' : 'ghost'}
			size="xs"
			onclick={() => (graph.rail = graph.rail?.type === 'paths' ? null : { type: 'paths' })}
			title="Path finder"
			aria-label="Path finder"
		>
			<RouteIcon class="h-3.5 w-3.5" />
		</Button>
		<Button
			variant={showLegend ? 'secondary' : 'ghost'}
			size="xs"
			onclick={() => (showLegend = !showLegend)}
			title="Legend"
			aria-label="Legend"
			aria-pressed={showLegend}
		>
			<ListIcon class="h-3.5 w-3.5" />
		</Button>
		<Button
			variant={graph.showMinimap ? 'secondary' : 'ghost'}
			size="xs"
			onclick={() => setDisplay('showMinimap', !graph.showMinimap)}
			title="Minimap"
			aria-label="Minimap"
			aria-pressed={graph.showMinimap}
		>
			<MapIcon class="h-3.5 w-3.5" />
		</Button>
		<Popover.Root bind:open={showHelp}>
			<Popover.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="xs"
						title="Keyboard shortcuts (?)"
						aria-label="Keyboard shortcuts"
					>
						<HelpCircleIcon class="h-3.5 w-3.5" />
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content align="end" class="w-80 p-3">
				<h2 class="mb-2 text-sm font-semibold">Keyboard shortcuts</h2>
				<ul class="space-y-1 text-xs">
					{#each GRAPH_SHORTCUTS as s (s.action)}
						<li class="flex items-center gap-2">
							<span class="flex shrink-0 gap-0.5">
								{#each s.keys as k (k)}
									<kbd class="rounded border bg-muted px-1 font-mono text-[10px]">{k}</kbd>
								{/each}
							</span>
							<span class="text-muted-foreground">{s.description}</span>
						</li>
					{/each}
				</ul>
				<h3 class="mb-1 mt-3 text-xs font-semibold">Mouse</h3>
				<ul class="space-y-0.5 text-xs text-muted-foreground">
					<li>Right-click the canvas, a node or a relation for its menu.</li>
					<li>Drag the handle of a hovered node onto another node to connect them.</li>
					<li>Shift + drag on the background to select several nodes.</li>
					<li>Double-click a node to expand its neighbours.</li>
				</ul>
			</Popover.Content>
		</Popover.Root>
		<Button
			variant="ghost"
			size="xs"
			onclick={() => actions.run(() => graph.refresh())}
			disabled={graph.refreshing || graph.loading}
			title="Reload the graph"
			aria-label="Reload the graph"
		>
			<RefreshCwIcon class="h-3.5 w-3.5 {graph.refreshing ? 'animate-spin' : ''}" />
		</Button>
	</div>
</div>

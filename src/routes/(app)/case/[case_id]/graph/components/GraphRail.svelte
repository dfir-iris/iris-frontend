<!--
  Right detail rail. Shows the card of the rail target (node, relation,
  bundle, fan-out, selection), the path finder, and the panels registered by
  other features through `graph.registerPanel`.
-->
<script lang="ts">
	import { InfoIcon, RouteIcon, XIcon } from 'lucide-svelte';
	import type { CaseGraphState } from '../lib/graph-state.svelte';
	import type { GraphReferenceData } from '../lib/reference-data.svelte';
	import type { GraphActions } from '../lib/actions';
	import NodeDetails from './NodeDetails.svelte';
	import EdgeDetails from './EdgeDetails.svelte';
	import GroupDetails from './GroupDetails.svelte';
	import SelectionDetails from './SelectionDetails.svelte';
	import PathFinderPanel from './PathFinderPanel.svelte';

	interface Props {
		graph: CaseGraphState;
		refs: GraphReferenceData;
		canEdit: boolean;
		actions: GraphActions;
	}

	let { graph, refs, canEdit, actions }: Props = $props();

	/** Last "details" target, so switching tabs and back keeps it. */
	let lastDetails = $state<CaseGraphState['rail']>(null);

	$effect(() => {
		const r = graph.rail;
		if (r && r.type !== 'paths' && r.type !== 'panel') lastDetails = r;
	});

	const panels = $derived(
		[...graph.panels.values()].sort(
			(a, b) => (a.order ?? 100) - (b.order ?? 100) || a.title.localeCompare(b.title)
		)
	);

	const tab = $derived(
		graph.rail?.type === 'paths'
			? 'paths'
			: graph.rail?.type === 'panel'
				? `panel:${graph.rail.id}`
				: 'details'
	);

	const details = $derived(
		graph.rail && graph.rail.type !== 'paths' && graph.rail.type !== 'panel'
			? graph.rail
			: lastDetails
	);

	const node = $derived(details?.type === 'node' ? graph.node(details.key) : undefined);
	const edge = $derived(details?.type === 'edge' ? graph.edge(details.key) : undefined);
	const panel = $derived(
		graph.rail?.type === 'panel' ? graph.panels.get(graph.rail.id) : undefined
	);

	const tabClass = (active: boolean) =>
		`flex items-center gap-1 rounded px-2 py-1 text-xs font-medium ${
			active ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
		}`;
</script>

<aside class="flex w-80 shrink-0 flex-col border-l bg-card" aria-label="Graph details">
	<div class="flex items-center gap-1 border-b bg-muted/40 px-2 py-1.5">
		<div class="flex min-w-0 flex-1 gap-0.5 overflow-x-auto" role="tablist">
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'details'}
				class={tabClass(tab === 'details')}
				onclick={() => (graph.rail = lastDetails ?? { type: 'selection' })}
			>
				<InfoIcon class="h-3.5 w-3.5" />Details
			</button>
			<button
				type="button"
				role="tab"
				aria-selected={tab === 'paths'}
				class={tabClass(tab === 'paths')}
				onclick={() => (graph.rail = { type: 'paths' })}
			>
				<RouteIcon class="h-3.5 w-3.5" />Paths
			</button>
			{#each panels as p (p.id)}
				<button
					type="button"
					role="tab"
					aria-selected={tab === `panel:${p.id}`}
					class={tabClass(tab === `panel:${p.id}`)}
					onclick={() => (graph.rail = { type: 'panel', id: p.id })}
				>
					{#if p.icon}
						<p.icon class="h-3.5 w-3.5" />
					{/if}
					{p.title}
				</button>
			{/each}
		</div>
		<button
			type="button"
			class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
			aria-label="Close the details"
			title="Close"
			onclick={() => (graph.rail = null)}
		>
			<XIcon class="h-4 w-4" />
		</button>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto">
		{#if tab === 'paths'}
			<PathFinderPanel {graph} {refs} />
		{:else if panel}
			<panel.component {graph} />
		{:else if node}
			<NodeDetails {graph} {node} {canEdit} {actions} />
		{:else if edge}
			<EdgeDetails {graph} {edge} {canEdit} {actions} />
		{:else if details?.type === 'bundle' || details?.type === 'fanout'}
			<GroupDetails {graph} type={details.type} id={details.id} />
		{:else if details?.type === 'selection' && graph.selection.length}
			<SelectionDetails {graph} {canEdit} {actions} />
		{:else}
			<p class="p-4 text-xs text-muted-foreground">
				Select a node or a relation to see its details. Drag on the background with Shift held to
				select several.
			</p>
		{/if}
	</div>
</aside>

<!--
  Table display of the graph, drawn over the (still mounted) canvas: objects
  and relations, restricted by the same filters and search as the canvas.
-->
<script lang="ts">
	import { CopyIcon, SearchIcon, SplineIcon, XIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { toast } from '$lib/components/ui/toast';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { getGraphFeatures } from '../context';
	import { locateOnCanvas } from '../locate';
	import NodesTable from './NodesTable.svelte';
	import EdgesTable from './EdgesTable.svelte';

	let { graph }: { graph: CaseGraphState } = $props();

	const { canEdit, actions } = getGraphFeatures();

	let tab = $state<'nodes' | 'edges'>('nodes');
	let filter = $state('');
	let csv = $state<(() => string) | null>(null);

	const nodeCount = $derived(graph.visibility.nodes.size);
	const edgeCount = $derived(graph.visibility.edges.size);

	/** Back to the canvas with the given objects / relations selected and in view. */
	const locate = (nodeKeys: string[], edgeKeys: string[] = []) =>
		locateOnCanvas(graph, nodeKeys, edgeKeys);

	const copyCsv = async () => {
		if (!csv) return;
		try {
			await navigator.clipboard.writeText(csv());
			toast({ title: 'Rows copied as CSV', variant: 'success' });
		} catch {
			toast({ title: 'Could not access the clipboard', variant: 'destructive' });
		}
	};

	const onKeydown = (e: KeyboardEvent) => {
		// The canvas shortcuts (Del, H, P, E, Ctrl+A…) must not act on hidden canvas elements.
		if (e.key === 'Escape' && !(e.target as Element | null)?.closest?.('input, select')) {
			graph.viewMode = 'canvas';
		}
		e.stopPropagation();
	};
</script>

{#if graph.viewMode === 'table'}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<section
		class="absolute inset-0 z-20 flex min-h-0 flex-col bg-background"
		aria-label="Graph as tables"
		onkeydown={onKeydown}
	>
		<div class="flex flex-wrap items-center gap-2 border-b px-3 py-1.5">
			<div role="tablist" aria-label="Table" class="inline-flex rounded-md border p-0.5">
				<button
					type="button"
					role="tab"
					id="graph-table-tab-nodes"
					aria-controls="graph-table-panel"
					aria-selected={tab === 'nodes'}
					class="rounded px-2 py-0.5 text-xs {tab === 'nodes'
						? 'bg-secondary text-secondary-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (tab = 'nodes')}
				>
					Objects <span class="tabular-nums text-muted-foreground">{nodeCount}</span>
				</button>
				<button
					type="button"
					role="tab"
					id="graph-table-tab-edges"
					aria-controls="graph-table-panel"
					aria-selected={tab === 'edges'}
					class="rounded px-2 py-0.5 text-xs {tab === 'edges'
						? 'bg-secondary text-secondary-foreground'
						: 'text-muted-foreground hover:text-foreground'}"
					onclick={() => (tab = 'edges')}
				>
					Relations <span class="tabular-nums text-muted-foreground">{edgeCount}</span>
				</button>
			</div>
			<div class="relative w-56">
				<SearchIcon
					class="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
				/>
				<Input
					bind:value={filter}
					class="h-7 pl-7 text-xs"
					placeholder="Filter the rows…"
					aria-label="Filter the rows"
				/>
			</div>
			<p class="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
				The canvas filters, focus, time range and search apply{graph.query
					? ` — search “${graph.query}”`
					: ''}.
				{#if graph.hidden.size}
					<button
						type="button"
						class="underline-offset-2 hover:underline"
						onclick={() => graph.unhideAll()}
					>
						Show the {graph.hidden.size} hidden
					</button>
				{/if}
			</p>
			<Button size="xs" variant="ghost" disabled={!csv} onclick={copyCsv} title="Copy as CSV">
				<CopyIcon class="mr-1 h-3.5 w-3.5" />CSV
			</Button>
			<Button size="xs" variant="outline" onclick={() => (graph.viewMode = 'canvas')}>
				<SplineIcon class="mr-1 h-3.5 w-3.5" />Canvas
			</Button>
			<button
				type="button"
				class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
				aria-label="Close the table"
				onclick={() => (graph.viewMode = 'canvas')}
			>
				<XIcon class="h-3.5 w-3.5" />
			</button>
		</div>

		<div
			id="graph-table-panel"
			role="tabpanel"
			aria-labelledby={tab === 'nodes' ? 'graph-table-tab-nodes' : 'graph-table-tab-edges'}
			class="flex min-h-0 flex-1 flex-col"
		>
			{#if tab === 'nodes'}
				<NodesTable {graph} {filter} {locate} bind:csv />
			{:else}
				<EdgesTable {graph} {filter} {locate} canEdit={canEdit()} {actions} bind:csv />
			{/if}
		</div>
	</section>
{/if}

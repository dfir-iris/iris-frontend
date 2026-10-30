<!--
  Left palette: case assets / IOCs that are not on the canvas. Drag one onto
  the canvas (or click +) to place it; the choice is kept in the view state.
-->
<script lang="ts">
	import { PlusIcon, SearchIcon, XIcon } from 'lucide-svelte';
	import { Input } from '$lib/components/ui/input';
	import type { GraphNode } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../lib/graph-state.svelte';
	import { encodeDragKeys, GRAPH_DRAG_MIME } from '../lib/canvas';
	import { searchNodes } from '../lib/search';
	import NodeKindIcon from './NodeKindIcon.svelte';

	interface Props {
		graph: CaseGraphState;
		/** Place keys at the centre of the view. */
		onAdd: (keys: string[]) => void;
		onClose: () => void;
	}

	let { graph, onAdd, onClose }: Props = $props();

	let query = $state('');
	let kind = $state<'all' | 'asset' | 'ioc'>('all');

	const LIMIT = 300;

	const items = $derived.by<GraphNode[]>(() => {
		const pool = graph.offCanvas
			.filter((n) => kind === 'all' || n.kind === kind)
			.sort((a, b) => a.kind.localeCompare(b.kind) || a.label.localeCompare(b.label));
		const hits = searchNodes(pool, query);
		return hits ? pool.filter((n) => hits.includes(n.key)) : pool;
	});

	const onDragStart = (e: DragEvent, key: string) => {
		if (!e.dataTransfer) return;
		e.dataTransfer.setData(GRAPH_DRAG_MIME, encodeDragKeys([key]));
		e.dataTransfer.setData('text/plain', graph.node(key)?.label ?? key);
		e.dataTransfer.effectAllowed = 'copy';
	};
</script>

<aside class="flex w-64 shrink-0 flex-col border-r bg-card" aria-label="Objects off the canvas">
	<div class="flex items-center gap-2 border-b px-3 py-2">
		<h2 class="flex-1 text-xs font-semibold uppercase text-muted-foreground">
			Off canvas ({graph.offCanvas.length})
		</h2>
		<button
			type="button"
			class="rounded p-1 text-muted-foreground hover:bg-accent"
			aria-label="Close the palette"
			onclick={onClose}
		>
			<XIcon class="h-3.5 w-3.5" />
		</button>
	</div>
	<div class="space-y-2 border-b p-2">
		<div class="relative">
			<SearchIcon
				class="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground"
			/>
			<Input
				class="h-7 pl-7 text-xs"
				placeholder="Filter…"
				bind:value={query}
				aria-label="Filter the palette"
			/>
		</div>
		<div class="flex gap-1 text-[11px]">
			{#each [['all', 'All'], ['asset', 'Assets'], ['ioc', 'IOCs']] as [id, label] (id)}
				<button
					type="button"
					class="flex-1 rounded px-1 py-0.5 {kind === id
						? 'bg-primary text-primary-foreground'
						: 'bg-muted hover:bg-accent'}"
					aria-pressed={kind === id}
					onclick={() => (kind = id as typeof kind)}
				>
					{label}
				</button>
			{/each}
		</div>
		{#if items.length > 1}
			<button
				type="button"
				class="w-full rounded border border-dashed px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
				onclick={() => onAdd(items.slice(0, LIMIT).map((n) => n.key))}
			>
				Add the {Math.min(items.length, LIMIT)} listed to the canvas
			</button>
		{/if}
	</div>
	<ul class="min-h-0 flex-1 overflow-y-auto p-1">
		{#each items.slice(0, LIMIT) as n (n.key)}
			<li
				class="group flex cursor-grab items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent active:cursor-grabbing"
				draggable="true"
				ondragstart={(e) => onDragStart(e, n.key)}
				title="Drag onto the canvas"
			>
				<NodeKindIcon kind={n.kind} class="h-3.5 w-3.5" />
				<span class="min-w-0 flex-1">
					<span class="block truncate">{n.label}</span>
					{#if n.type}
						<span class="block truncate text-[10px] text-muted-foreground">{n.type}</span>
					{/if}
				</span>
				<button
					type="button"
					class="rounded p-0.5 opacity-0 hover:bg-background focus:opacity-100 group-hover:opacity-100"
					aria-label="Add {n.label} to the canvas"
					onclick={() => onAdd([n.key])}
				>
					<PlusIcon class="h-3.5 w-3.5" />
				</button>
			</li>
		{:else}
			<li class="px-2 py-6 text-center text-xs text-muted-foreground">
				{graph.offCanvas.length ? 'No match.' : 'Every asset and IOC is on the canvas.'}
			</li>
		{/each}
		{#if items.length > LIMIT}
			<li class="px-2 py-1 text-[11px] text-muted-foreground">
				{items.length - LIMIT} more — refine the filter.
			</li>
		{/if}
	</ul>
</aside>

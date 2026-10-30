<!--
  Rail card of a folded element: a bundle of parallel relations or an IOC
  fan-out. Lists the members and unfolds them.
-->
<script lang="ts">
	import { mode } from 'mode-watcher';
	import { ChevronsLeftRightIcon, ChevronsRightLeftIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { paletteHex } from '$lib/components/common/CytoscapeGraph';
	import type { CaseGraphState } from '../lib/graph-state.svelte';
	import NodeKindIcon from './NodeKindIcon.svelte';

	interface Props {
		graph: CaseGraphState;
		type: 'bundle' | 'fanout';
		id: string;
	}

	let { graph, type, id }: Props = $props();

	const isDark = $derived($mode === 'dark');

	const bundleEdges = $derived(
		type === 'bundle'
			? (graph.output.bundles.get(id) ?? [])
					.map((k) => graph.edge(k))
					.filter((e) => e !== undefined)
			: []
	);
	const fan = $derived(type === 'fanout' ? graph.output.fanouts.get(id) : undefined);
	const fanAsset = $derived(fan ? graph.node(fan.asset) : undefined);
	const fanIocs = $derived(
		(fan?.iocs ?? [])
			.map((k) => graph.node(k))
			.filter((n) => n !== undefined)
			.sort((a, b) => a.label.localeCompare(b.label))
	);
	const bundleEnds = $derived.by(() => {
		const e = bundleEdges[0];
		return e
			? [graph.node(e.source)?.label ?? e.source, graph.node(e.target)?.label ?? e.target]
			: [];
	});

	const openEdge = (key: string) => {
		const pair = id;
		graph.toggleBundle(pair);
		graph.rail = { type: 'edge', key };
		queueMicrotask(() => graph.select([key]));
	};

	const openIoc = (key: string) => {
		if (fan) graph.toggleFanout(fan.asset);
		graph.rail = { type: 'node', key };
		queueMicrotask(() => graph.select([key], { center: true }));
	};
</script>

<div class="space-y-3 p-4">
	{#if type === 'bundle'}
		<header>
			<h2 class="text-sm font-semibold">{bundleEdges.length} relations</h2>
			<p class="truncate text-xs text-muted-foreground">{bundleEnds.join(' ↔ ')}</p>
		</header>
		<Button size="xs" variant="outline" class="w-full" onclick={() => graph.toggleBundle(id)}>
			<ChevronsLeftRightIcon class="mr-1 h-3 w-3" />Show them separately
		</Button>
		<ul class="space-y-0.5">
			{#each bundleEdges as e (e.key)}
				<li>
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-accent"
						onclick={() => openEdge(e.key)}
					>
						<span
							class="h-1 w-4 shrink-0 rounded"
							style="background: {paletteHex(e.relation.color, isDark)}"
						></span>
						<span class="min-w-0 flex-1 truncate">{e.label || e.relation.label}</span>
						{#if e.review_state === 'pending'}
							<span class="text-[10px] uppercase text-amber-600">pending</span>
						{/if}
						{#if e.count > 1}
							<span class="text-muted-foreground">×{e.count}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{:else if fan}
		<header>
			<h2 class="text-sm font-semibold">{fanIocs.length} IOCs</h2>
			<p class="truncate text-xs text-muted-foreground">
				Only linked to {fanAsset?.label ?? fan.asset}
			</p>
		</header>
		<Button
			size="xs"
			variant="outline"
			class="w-full"
			onclick={() => {
				graph.toggleFanout(fan.asset);
				graph.rail = { type: 'node', key: fan.asset };
			}}
		>
			<ChevronsRightLeftIcon class="mr-1 h-3 w-3" />Unfold on the canvas
		</Button>
		<ul class="space-y-0.5">
			{#each fanIocs as n (n.key)}
				<li>
					<button
						type="button"
						class="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs hover:bg-accent"
						onclick={() => openIoc(n.key)}
					>
						<NodeKindIcon kind={n.kind} class="h-3.5 w-3.5" />
						<span class="min-w-0 flex-1 truncate">{n.label}</span>
						{#if n.type}
							<span class="text-muted-foreground">{n.type}</span>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-xs text-muted-foreground">This group is no longer on the canvas.</p>
	{/if}
</div>

<!-- Rail panel: what the investigation still misses, by severity; a click shows the objects. -->
<script lang="ts">
	import { CircleCheckIcon, LoaderCircleIcon, RefreshCwIcon, ShieldAlertIcon } from 'lucide-svelte';
	import type { GraphGap } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { GAP_LABEL, GAP_SEVERITIES, gapCounts } from '../../lib/insights';
	import { getGraphFeatures } from '../context';
	import { locateOnCanvas } from '../locate';
	import { showPreview } from './helpers';

	let { graph }: { graph: CaseGraphState } = $props();

	const { insights } = getGraphFeatures();

	let clearPreview: (() => void) | null = null;

	$effect(() => {
		if (insights.gapsState === 'idle' || insights.gapsState === 'stale') void insights.loadGaps();
	});

	$effect(() => () => clearPreview?.());

	const counts = $derived(gapCounts(insights.gaps));

	const SEVERITY_CLASS: Record<string, string> = {
		high: 'bg-red-500/15 text-red-700 dark:text-red-300',
		medium: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
		low: 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
	};

	const BAR_CLASS: Record<string, string> = {
		high: 'border-l-red-500',
		medium: 'border-l-amber-500',
		low: 'border-l-sky-500'
	};

	const hover = (g: GraphGap | null) => {
		clearPreview?.();
		clearPreview = g ? showPreview(graph, g.node_keys, g.edge_keys) : null;
	};

	const focus = (g: GraphGap) => locateOnCanvas(graph, g.node_keys, g.edge_keys);

	const involved = (g: GraphGap) => {
		const labels = g.node_keys.map((k) => graph.node(k)?.label ?? k);
		return labels.length > 3
			? `${labels.slice(0, 3).join(', ')} +${labels.length - 3}`
			: labels.join(', ');
	};
</script>

<div class="flex flex-col gap-2 p-3">
	<div class="flex items-center gap-2">
		<ShieldAlertIcon class="h-4 w-4 text-primary" />
		<h3 class="flex-1 text-sm font-medium">Investigation gaps</h3>
		<button
			type="button"
			class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
			title="Recompute"
			aria-label="Recompute the gaps"
			disabled={insights.gapsState === 'loading'}
			onclick={() => insights.loadGaps()}
		>
			<RefreshCwIcon class="h-3.5 w-3.5 {insights.gapsState === 'loading' ? 'animate-spin' : ''}" />
		</button>
	</div>
	<p class="text-[11px] text-muted-foreground">
		Computed on the accepted relations of the default graph. Click one to show its objects.
	</p>
	{#if insights.gaps.length}
		<div class="flex gap-1.5 text-[11px]">
			{#each GAP_SEVERITIES as s (s)}
				<span class="rounded px-1.5 py-0.5 tabular-nums {SEVERITY_CLASS[s]}">
					{counts[s]}
					{s}
				</span>
			{/each}
		</div>
	{/if}

	{#if insights.gapsState === 'loading' && !insights.gaps.length}
		<div class="flex items-center gap-2 py-6 text-xs text-muted-foreground" role="status">
			<LoaderCircleIcon class="h-4 w-4 animate-spin" />Looking for gaps…
		</div>
	{:else if insights.gapsError}
		<p
			class="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
		>
			{insights.gapsError}
		</p>
	{:else if !insights.gaps.length}
		<p class="flex flex-col items-center gap-1 py-6 text-center text-xs text-muted-foreground">
			<CircleCheckIcon class="h-5 w-5 text-emerald-500" />No gap found.
		</p>
	{:else}
		<ul class="space-y-1">
			{#each insights.gaps as g, i (`${g.code}:${i}`)}
				<li>
					<button
						type="button"
						class="w-full rounded-md border border-l-4 p-2 text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring {BAR_CLASS[
							g.severity
						] ?? ''}"
						onmouseenter={() => hover(g)}
						onmouseleave={() => hover(null)}
						onfocus={() => hover(g)}
						onblur={() => hover(null)}
						onclick={() => focus(g)}
					>
						<div class="flex items-center gap-1.5">
							<span
								class="rounded px-1 text-[10px] font-medium uppercase {SEVERITY_CLASS[g.severity] ??
									'bg-muted'}">{g.severity}</span
							>
							<span class="truncate text-xs font-medium">{GAP_LABEL[g.code] ?? g.code}</span>
						</div>
						<p class="mt-1 text-[11px] text-muted-foreground">{g.message}</p>
						{#if g.node_keys.length}
							<p class="mt-0.5 truncate text-[11px]" title={involved(g)}>{involved(g)}</p>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>

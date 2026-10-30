<!-- Rail panel: relations proposed by the AI (stored as pending), to accept or reject. -->
<script lang="ts">
	import {
		BotIcon,
		CheckIcon,
		CrosshairIcon,
		LoaderCircleIcon,
		TriangleAlertIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { GraphEdge } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { pendingAiEdges } from '../../lib/insights';
	import { getGraphFeatures } from '../context';
	import { locateOnCanvas } from '../locate';
	import Endpoints from './Endpoints.svelte';
	import { showPreview } from './helpers';

	let { graph }: { graph: CaseGraphState } = $props();

	const { insights, canEdit, actions } = getGraphFeatures();

	const editable = $derived(canEdit());
	const pending = $derived(pendingAiEdges(graph.edges));
	let busy = $state.raw<Set<string>>(new Set());
	let clearPreview: (() => void) | null = null;

	$effect(() => () => clearPreview?.());

	const hover = (e: GraphEdge | null) => {
		clearPreview?.();
		clearPreview = e ? showPreview(graph, [e.source, e.target], [e.key]) : null;
	};

	const withBusy = async (keys: string[], fn: () => Promise<unknown>, success: string) => {
		busy = new Set([...busy, ...keys]);
		try {
			await actions.run(fn, success);
		} finally {
			const next = new Set(busy);
			keys.forEach((k) => next.delete(k));
			busy = next;
		}
	};

	const review = (e: GraphEdge, decision: 'accept' | 'reject') =>
		withBusy(
			[e.key],
			() => graph.reviewEdge(e, decision),
			decision === 'accept' ? 'Relation accepted' : 'Relation rejected'
		);

	const reviewAll = (decision: 'accepted' | 'rejected') => {
		const edges = pending;
		return withBusy(
			edges.map((e) => e.key),
			() =>
				graph.updateEdges(
					edges,
					{ review_state: decision },
					decision === 'accepted' ? 'Accept AI relations' : 'Reject AI relations'
				),
			`${edges.length} relation${edges.length > 1 ? 's' : ''} ${decision}`
		);
	};
</script>

<div class="flex flex-col gap-2 p-3">
	<div class="flex items-center gap-2">
		<BotIcon class="h-4 w-4 text-primary" />
		<h3 class="flex-1 text-sm font-medium">AI proposals</h3>
	</div>
	<p class="text-[11px] text-muted-foreground">
		The assistant reads the graph and the timeline, and proposes relations. They are stored as
		<em>pending</em> until someone reviews them.
	</p>

	{#if editable}
		<Button
			size="sm"
			variant="outline"
			disabled={insights.aiRunning}
			onclick={() => insights.runAi()}
		>
			{#if insights.aiRunning}
				<LoaderCircleIcon class="mr-1.5 h-3.5 w-3.5 animate-spin" />Reading the graph…
			{:else}
				<BotIcon class="mr-1.5 h-3.5 w-3.5" />Propose relations
			{/if}
		</Button>
		{#if insights.aiRunning}
			<p class="text-[11px] text-muted-foreground" role="status">This can take a minute.</p>
		{/if}
	{:else}
		<p class="text-[11px] text-muted-foreground">Asking the AI needs full access to the case.</p>
	{/if}

	{#if insights.aiError}
		<p
			class="flex gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
			role="alert"
		>
			<TriangleAlertIcon class="mt-0.5 h-3.5 w-3.5 shrink-0" />{insights.aiError}
		</p>
	{:else if insights.aiOutcome}
		<p class="rounded-md bg-muted px-2 py-1 text-xs" role="status">{insights.aiOutcome}</p>
	{/if}

	<div class="mt-1 flex items-center gap-2 border-b pb-1">
		<h4 class="flex-1 text-xs font-medium">
			To review <span class="tabular-nums text-muted-foreground">{pending.length}</span>
		</h4>
		{#if editable && pending.length > 1}
			<Button
				size="xs"
				variant="ghost"
				disabled={busy.size > 0}
				onclick={() => reviewAll('accepted')}
			>
				Accept all
			</Button>
			<Button
				size="xs"
				variant="ghost"
				disabled={busy.size > 0}
				onclick={() => reviewAll('rejected')}
			>
				Reject all
			</Button>
		{/if}
	</div>
	{#if pending.length && !graph.showPending}
		<p class="text-[11px] text-muted-foreground">
			Pending relations are hidden on the canvas.
			<button
				type="button"
				class="underline underline-offset-2 hover:text-foreground"
				onclick={() => {
					graph.showPending = true;
					graph.markDirty();
				}}
			>
				Show them
			</button>
		</p>
	{/if}

	{#if !pending.length}
		<p class="py-4 text-center text-xs text-muted-foreground">No AI relation waiting for review.</p>
	{:else}
		<ul class="space-y-1">
			{#each pending as e (e.key)}
				{@const isBusy = busy.has(e.key)}
				<li
					class="flex gap-2 rounded-md border p-2 hover:border-primary/50 hover:bg-accent/40 {isBusy
						? 'opacity-60'
						: ''}"
					onmouseenter={() => hover(e)}
					onmouseleave={() => hover(null)}
					onfocusin={() => hover(e)}
					onfocusout={() => hover(null)}
				>
					<div class="min-w-0 flex-1 space-y-1">
						<Endpoints
							{graph}
							source={e.source}
							target={e.target}
							relation={e.relation?.label || e.relation?.name || 'related to'}
							directed={e.directed}
						/>
						{#if e.description}
							<p class="line-clamp-3 text-[11px] text-muted-foreground" title={e.description}>
								{e.description}
							</p>
						{/if}
						<div class="flex items-center gap-2 text-[10px] text-muted-foreground">
							{#if e.confidence !== null && e.confidence !== undefined}
								<span class="rounded bg-muted px-1 tabular-nums text-foreground" title="Confidence"
									>{e.confidence}%</span
								>
							{/if}
							{#if e.event_ids?.length}
								<span>{e.event_ids.length} event{e.event_ids.length > 1 ? 's' : ''}</span>
							{/if}
						</div>
					</div>
					<div class="flex shrink-0 flex-col gap-0.5">
						<button
							type="button"
							class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
							title="Show on the canvas"
							aria-label="Show on the canvas"
							onclick={() => locateOnCanvas(graph, [], [e.key])}
						>
							<CrosshairIcon class="h-3.5 w-3.5" />
						</button>
						{#if editable}
							<button
								type="button"
								class="rounded p-1 text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"
								title="Accept"
								aria-label="Accept"
								disabled={isBusy}
								onclick={() => review(e, 'accept')}
							>
								<CheckIcon class="h-3.5 w-3.5" />
							</button>
							<button
								type="button"
								class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
								title="Reject"
								aria-label="Reject"
								disabled={isBusy}
								onclick={() => review(e, 'reject')}
							>
								<XIcon class="h-3.5 w-3.5" />
							</button>
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

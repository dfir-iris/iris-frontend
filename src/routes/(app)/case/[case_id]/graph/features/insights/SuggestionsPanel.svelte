<!-- Rail panel: heuristic relation suggestions, grouped by reason, to accept or dismiss. -->
<script lang="ts">
	import {
		CheckIcon,
		CrosshairIcon,
		LoaderCircleIcon,
		RefreshCwIcon,
		SparklesIcon,
		XIcon
	} from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import type { GraphSuggestion } from '$lib/types/resources/case-graph';
	import type { CaseGraphState } from '../../lib/graph-state.svelte';
	import { groupSuggestions } from '../../lib/insights';
	import { getGraphFeatures } from '../context';
	import { locateOnCanvas } from '../locate';
	import { indeterminate } from '../table/indeterminate';
	import Endpoints from './Endpoints.svelte';
	import { notify, showPreview } from './helpers';

	let { graph }: { graph: CaseGraphState } = $props();

	const { insights, canEdit } = getGraphFeatures();

	let selected = $state.raw<Set<string>>(new Set());
	let clearPreview: (() => void) | null = null;

	$effect(() => {
		if (insights.suggestionsState === 'idle' || insights.suggestionsState === 'stale') {
			void insights.loadSuggestions();
		}
	});

	// Drop the preview when the panel goes away.
	$effect(() => () => clearPreview?.());

	const groups = $derived(groupSuggestions(insights.suggestions));
	const editable = $derived(canEdit());

	// Forget selected keys that left the list.
	$effect(() => {
		const keys = new Set(insights.suggestions.map((s) => s.key));
		const kept = [...selected].filter((k) => keys.has(k));
		if (kept.length !== selected.size) selected = new Set(kept);
	});

	const relationLabel = (name: string) =>
		graph.relationTypes.find((t) => t.name === name)?.label ?? name.replace(/_/g, ' ');

	const toggle = (key: string, on: boolean) => {
		const next = new Set(selected);
		if (on) next.add(key);
		else next.delete(key);
		selected = next;
	};

	const toggleGroup = (items: GraphSuggestion[], on: boolean) => {
		const next = new Set(selected);
		for (const s of items) {
			if (on) next.add(s.key);
			else next.delete(s.key);
		}
		selected = next;
	};

	const hover = (s: GraphSuggestion | null) => {
		clearPreview?.();
		clearPreview = s ? showPreview(graph, [s.source, s.target]) : null;
	};

	const accept = (keys: string[]) => notify(() => insights.acceptSuggestions(keys));
	const dismiss = (keys: string[]) => notify(() => insights.dismissSuggestions(keys));

	const evidenceOf = (s: GraphSuggestion) => {
		const parts: string[] = [];
		if (s.event_ids.length) {
			parts.push(`${s.event_ids.length} event${s.event_ids.length > 1 ? 's' : ''}`);
		}
		const alerts = s.alert_ids?.length ?? 0;
		if (alerts) parts.push(`${alerts} alert${alerts > 1 ? 's' : ''}`);
		return parts.join(', ');
	};
</script>

<div class="flex flex-col gap-2 p-3">
	<div class="flex items-center gap-2">
		<SparklesIcon class="h-4 w-4 text-primary" />
		<h3 class="flex-1 text-sm font-medium">
			Suggested relations
			{#if insights.suggestions.length}
				<span class="tabular-nums text-muted-foreground">({insights.suggestions.length})</span>
			{/if}
		</h3>
		<button
			type="button"
			class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
			title="Recompute"
			aria-label="Recompute the suggestions"
			disabled={insights.suggestionsState === 'loading'}
			onclick={() => insights.loadSuggestions()}
		>
			<RefreshCwIcon
				class="h-3.5 w-3.5 {insights.suggestionsState === 'loading' ? 'animate-spin' : ''}"
			/>
		</button>
	</div>
	<p class="text-[11px] text-muted-foreground">
		Computed from the timeline, alerts and enrichments. Hover one to see its objects on the canvas.
		{#if !editable}You can review them, but not accept or dismiss them (read-only access).{/if}
	</p>

	{#if editable && selected.size}
		<div
			class="sticky top-0 z-10 flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs shadow-sm"
		>
			<span class="flex-1 tabular-nums">{selected.size} selected</span>
			<Button size="xs" onclick={() => accept([...selected])}>
				<CheckIcon class="mr-1 h-3.5 w-3.5" />Accept
			</Button>
			<Button size="xs" variant="outline" onclick={() => dismiss([...selected])}>
				<XIcon class="mr-1 h-3.5 w-3.5" />Dismiss
			</Button>
			<button
				type="button"
				class="rounded p-0.5 text-muted-foreground hover:bg-accent"
				aria-label="Clear the selection"
				onclick={() => (selected = new Set())}
			>
				<XIcon class="h-3 w-3" />
			</button>
		</div>
	{/if}

	{#if insights.suggestionsState === 'loading' && !insights.suggestions.length}
		<div class="flex items-center gap-2 py-6 text-xs text-muted-foreground" role="status">
			<LoaderCircleIcon class="h-4 w-4 animate-spin" />Looking for relations…
		</div>
	{:else if insights.suggestionsError}
		<p
			class="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive"
		>
			{insights.suggestionsError}
		</p>
	{:else if !groups.length}
		<p class="py-6 text-center text-xs text-muted-foreground">No suggestion for now.</p>
	{:else}
		{#each groups as g (g.kind)}
			{@const all = g.items.every((s) => selected.has(s.key))}
			{@const some = g.items.some((s) => selected.has(s.key))}
			<section class="space-y-1" aria-label={g.label}>
				<div class="flex items-center gap-2 border-b pb-1">
					{#if editable}
						<input
							type="checkbox"
							class="h-3.5 w-3.5 accent-primary"
							checked={all}
							use:indeterminate={some && !all}
							aria-label={`Select every ${g.label.toLowerCase()} suggestion`}
							onchange={(e) => toggleGroup(g.items, e.currentTarget.checked)}
						/>
					{/if}
					<h4 class="flex-1 text-xs font-medium" title={g.hint}>
						{g.label} <span class="tabular-nums text-muted-foreground">{g.items.length}</span>
					</h4>
				</div>
				<ul class="space-y-1">
					{#each g.items as s (s.key)}
						{@const busy = insights.busy.has(s.key)}
						<li
							class="group flex gap-2 rounded-md border p-2 hover:border-primary/50 hover:bg-accent/40 {busy
								? 'opacity-60'
								: ''}"
							onmouseenter={() => hover(s)}
							onmouseleave={() => hover(null)}
							onfocusin={() => hover(s)}
							onfocusout={() => hover(null)}
						>
							{#if editable}
								<input
									type="checkbox"
									class="mt-0.5 h-3.5 w-3.5 shrink-0 accent-primary"
									checked={selected.has(s.key)}
									disabled={busy}
									aria-label="Select this suggestion"
									onchange={(e) => toggle(s.key, e.currentTarget.checked)}
								/>
							{/if}
							<div class="min-w-0 flex-1 space-y-1">
								<Endpoints
									{graph}
									source={s.source}
									target={s.target}
									relation={relationLabel(s.relation)}
									directed={s.directed}
								/>
								<p class="line-clamp-2 text-[11px] text-muted-foreground" title={s.reason}>
									{s.reason}
								</p>
								<div class="flex items-center gap-2 text-[10px] text-muted-foreground">
									<span
										class="rounded bg-muted px-1 tabular-nums text-foreground"
										title="Confidence score">{s.score}</span
									>
									{#if evidenceOf(s)}<span>{evidenceOf(s)}</span>{/if}
								</div>
							</div>
							<div class="flex shrink-0 flex-col gap-0.5">
								<button
									type="button"
									class="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
									title="Show on the canvas"
									aria-label="Show on the canvas"
									onclick={() =>
										locateOnCanvas(graph, [s.source, s.target], [], { details: false })}
								>
									<CrosshairIcon class="h-3.5 w-3.5" />
								</button>
								{#if editable}
									<button
										type="button"
										class="rounded p-1 text-emerald-600 hover:bg-emerald-500/10 disabled:opacity-50 dark:text-emerald-400"
										title="Accept: create the relation"
										aria-label="Accept"
										disabled={busy}
										onclick={() => accept([s.key])}
									>
										<CheckIcon class="h-3.5 w-3.5" />
									</button>
									<button
										type="button"
										class="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
										title="Dismiss: do not suggest it again"
										aria-label="Dismiss"
										disabled={busy}
										onclick={() => dismiss([s.key])}
									>
										<XIcon class="h-3.5 w-3.5" />
									</button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</div>

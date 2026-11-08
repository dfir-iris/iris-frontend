<!--
  FIELDS panel of the search view: the most frequent values of the main
  fields among the matching events. Clicking a value narrows the search
  to it; the minus button excludes it instead.
-->
<script lang="ts">
	import { ChevronDownIcon, ChevronRightIcon, MinusIcon } from 'lucide-svelte';
	import type {
		CaseTimelineFieldSummary,
		CaseTimelineSummaryField
	} from '$lib/services/case-timeline.service';

	type Props = {
		fields: Partial<Record<CaseTimelineSummaryField, CaseTimelineFieldSummary>>;
		/** Matching events, to draw each value's share. */
		total: number;
		loading?: boolean;
		onClause: (alias: string, value: string, exclude: boolean) => void;
	};

	let { fields, total, loading = false, onClause }: Props = $props();

	// The alias each summary writes into the search bar is its own name.
	const FIELDS: { key: CaseTimelineSummaryField; label: string }[] = [
		{ key: 'category', label: 'Category' },
		{ key: 'source', label: 'Source' },
		{ key: 'tag', label: 'Tag' },
		{ key: 'asset', label: 'Asset' },
		{ key: 'ioc', label: 'IOC' },
		{ key: 'timeline', label: 'Timeline' },
		{ key: 'author', label: 'Author' }
	];

	const hasAny = $derived(
		FIELDS.some((f) =>
			(fields[f.key]?.values ?? []).some((v) => v.value !== null && v.value !== '')
		)
	);

	let collapsed = $state<Set<CaseTimelineSummaryField>>(new Set());

	const toggle = (key: CaseTimelineSummaryField) => {
		const next = new Set(collapsed);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		collapsed = next;
	};
</script>

<section class="flex min-h-0 flex-1 flex-col text-xs" aria-label="Fields">
	<header class="flex items-center justify-between border-b px-3 py-2">
		<h3 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Fields</h3>
		{#if loading}
			<span class="text-2xs text-muted-foreground">…</span>
		{/if}
	</header>

	<div class={['min-h-0 flex-1 overflow-y-auto py-1', loading && 'opacity-60']}>
		{#each FIELDS as field (field.key)}
			{@const summary = fields[field.key]}
			{@const values = (summary?.values ?? []).filter((v) => v.value !== null && v.value !== '')}
			{#if values.length}
				<div class="px-2 py-1">
					<button
						type="button"
						class="flex w-full items-center gap-1 rounded-sm px-1 py-0.5 text-left font-medium hover:bg-muted/50"
						onclick={() => toggle(field.key)}
						aria-expanded={!collapsed.has(field.key)}
					>
						{#if collapsed.has(field.key)}
							<ChevronRightIcon class="size-3 shrink-0" />
						{:else}
							<ChevronDownIcon class="size-3 shrink-0" />
						{/if}
						<span class="flex-1">{field.label}</span>
						<span class="text-2xs tabular-nums text-muted-foreground" title="Distinct values">
							{summary?.distinct ?? values.length}
						</span>
					</button>

					{#if !collapsed.has(field.key)}
						<ul class="mt-0.5 flex flex-col">
							{#each values as entry (entry.value)}
								<li class="group relative flex items-center gap-1 rounded-sm hover:bg-muted/50">
									<span
										aria-hidden="true"
										class="absolute inset-y-0.5 left-0 rounded-sm bg-primary/10"
										style="width: {total ? Math.min(100, (entry.count / total) * 100) : 0}%"
									></span>
									<button
										type="button"
										class="relative min-w-0 flex-1 truncate py-0.5 pl-5 text-left"
										title={`Show only ${field.label.toLowerCase()} ${entry.value}`}
										onclick={() => onClause(field.key, entry.value ?? '', false)}
									>
										{entry.value}
									</button>
									<span class="relative text-2xs tabular-nums text-muted-foreground">
										{entry.count.toLocaleString()}
									</span>
									<button
										type="button"
										class="invisible relative inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground group-hover:visible"
										title={`Exclude ${field.label.toLowerCase()} ${entry.value}`}
										aria-label={`Exclude ${field.label.toLowerCase()} ${entry.value}`}
										onclick={() => onClause(field.key, entry.value ?? '', true)}
									>
										<MinusIcon class="size-3" />
									</button>
								</li>
							{/each}
						</ul>
					{/if}
				</div>
			{/if}
		{/each}
		{#if !hasAny && !loading}
			<div class="px-3 py-4 text-center text-2xs text-muted-foreground">No values to show.</div>
		{/if}
	</div>
</section>

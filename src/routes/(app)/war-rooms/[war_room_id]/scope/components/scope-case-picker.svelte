<!--
  Multi-select of target cases (attached cases the caller can read). Write
  access is only known to the server, so a case the caller can merely read
  is still listed and comes back as "denied" in the results.
-->
<script lang="ts">
	import { Building2, Search } from 'lucide-svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import type { ScopeCase } from '$lib/services/war-room-scope.service';
	import { filterCases } from './helpers';

	type Props = {
		cases: ScopeCase[];
		selected: number[];
		onChange: (next: number[]) => void;
		/** Cases shown greyed with a note (e.g. the asset already lives there). */
		disabledIds?: number[];
		disabledNote?: string;
		idPrefix?: string;
		/** Most cases that may be ticked (server cap of the action). */
		max?: number;
	};

	let {
		cases,
		selected,
		onChange,
		disabledIds = [],
		disabledNote = 'source',
		idPrefix = 'scope-target',
		max
	}: Props = $props();

	// With hundreds of attached cases the list is searched, and only its
	// first RENDER_LIMIT matches are rendered; "Select all" still applies
	// to every match.
	const RENDER_LIMIT = 100;
	const SEARCH_FROM = 8;

	let search = $state('');

	const disabledSet = $derived(new Set(disabledIds));
	const selectedSet = $derived(new Set(selected));
	const matching = $derived(filterCases(cases, search));
	const shown = $derived(matching.slice(0, RENDER_LIMIT));
	const selectable = $derived(matching.filter((c) => !disabledSet.has(c.case_id)));
	const allSelected = $derived(
		selectable.length > 0 && selectable.every((c) => selectedSet.has(c.case_id))
	);
	const atMax = $derived(max !== undefined && selected.length >= max);

	const toggle = (caseId: number, on: boolean) => {
		const next = new Set(selected);
		if (on) {
			if (max !== undefined && next.size >= max) return;
			next.add(caseId);
		} else next.delete(caseId);
		onChange([...next]);
	};

	const toggleAll = () => {
		if (allSelected) {
			const drop = new Set(selectable.map((c) => c.case_id));
			onChange(selected.filter((id) => !drop.has(id)));
			return;
		}
		const next = new Set(selected);
		for (const c of selectable) {
			if (max !== undefined && next.size >= max) break;
			next.add(c.case_id);
		}
		onChange([...next]);
	};
</script>

<div class="rounded-md border">
	<div class="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-1.5">
		<p class="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
			Target cases ({selected.length}{max !== undefined ? ` / max ${max}` : ''})
		</p>
		<div class="flex items-center gap-3">
			{#if selected.length > 0}
				<button
					type="button"
					class="text-2xs text-muted-foreground transition-colors hover:text-foreground"
					onclick={() => onChange([])}
				>
					Clear
				</button>
			{/if}
			{#if selectable.length > 1 && !allSelected}
				<button
					type="button"
					class="text-2xs text-muted-foreground transition-colors hover:text-foreground"
					onclick={toggleAll}
				>
					{search.trim() ? `Select ${selectable.length} matching` : 'Select all'}
				</button>
			{/if}
		</div>
	</div>
	{#if cases.length > SEARCH_FROM}
		<div class="relative border-b px-2 py-1.5">
			<Search
				class="pointer-events-none absolute left-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
			/>
			<Input
				bind:value={search}
				placeholder="Search cases by #id, name or customer…"
				class="h-7 pl-7 text-xs"
				aria-label="Search target cases"
			/>
		</div>
	{/if}
	{#if cases.length === 0}
		<p class="p-3 text-center text-xs text-muted-foreground">
			No attached case you can access. Attach cases from the Cases tab first.
		</p>
	{:else if matching.length === 0}
		<p class="p-3 text-center text-xs text-muted-foreground">No case matches.</p>
	{:else}
		<ul class="max-h-56 divide-y overflow-y-auto" role="group" aria-label="Target cases">
			{#each shown as c (c.case_id)}
				{@const disabled = disabledSet.has(c.case_id)}
				{@const checked = selectedSet.has(c.case_id)}
				{@const blocked = !checked && !disabled && atMax}
				<li>
					<label
						for={`${idPrefix}-${c.case_id}`}
						class={[
							'flex w-full items-center gap-3 px-3 py-2 text-sm transition-colors',
							disabled || blocked
								? 'cursor-not-allowed opacity-60'
								: checked
									? 'cursor-pointer bg-primary/5'
									: 'cursor-pointer hover:bg-muted/40'
						]}
					>
						<Checkbox
							id={`${idPrefix}-${c.case_id}`}
							checked={checked && !disabled}
							disabled={disabled || blocked}
							onCheckedChange={(v) => toggle(c.case_id, !!v)}
							aria-label={`Target case #${c.case_id}`}
						/>
						<span class="font-mono text-2xs text-muted-foreground">#{c.case_id}</span>
						<span class="min-w-0 flex-1 truncate">{c.case_name}</span>
						{#if disabled}
							<span class="shrink-0 text-2xs text-muted-foreground">{disabledNote}</span>
						{/if}
						{#if c.customer_name}
							<span class="inline-flex shrink-0 items-center gap-1 text-2xs text-muted-foreground">
								<Building2 class="h-3 w-3 opacity-70" />
								<span class="max-w-[10rem] truncate">{c.customer_name}</span>
							</span>
						{/if}
					</label>
				</li>
			{/each}
			{#if matching.length > shown.length}
				<li class="px-3 py-2 text-center text-2xs text-muted-foreground">
					{matching.length - shown.length} more — refine the search to list them.
				</li>
			{/if}
		</ul>
	{/if}
	{#if atMax}
		<p class="border-t px-3 py-1.5 text-2xs text-muted-foreground">
			At most {max} target cases for this action.
		</p>
	{/if}
</div>

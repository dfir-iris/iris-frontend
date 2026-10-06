<!--
  Per-row case breakdown of the IOC matrix when there are too many cases
  for one column each: "N / M cases" opens a searchable list of the cases
  holding the indicator and of those missing it (with a push action).
  The lists are only built while the popover is open.
-->
<script lang="ts">
	import { Check, Plus, Send } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Popover, PopoverContent, PopoverTrigger } from '$lib/components/ui/popover';
	import type { ScopeCase } from '$lib/services/war-room-scope.service';
	import { caseLabel, filterCases, type IocRow } from './helpers';

	type Props = {
		row: IocRow;
		cases: ScopeCase[];
		/** Cases of `cases` holding the indicator. */
		presentCount: number;
		canWrite: boolean;
		onPush: (row: IocRow, caseIds: number[]) => void;
	};

	let { row, cases, presentCount, canWrite, onPush }: Props = $props();

	const LIST_LIMIT = 50;

	let open = $state(false);
	let search = $state('');

	const lists = $derived.by(() => {
		if (!open) return null;
		const matching = filterCases(cases, search);
		const present = matching.filter((c) => row.caseIds.has(c.case_id));
		const missing = matching.filter((c) => !row.caseIds.has(c.case_id));
		return { present, missing };
	});

	const pushMissing = () => {
		const ids = cases.filter((c) => !row.caseIds.has(c.case_id)).map((c) => c.case_id);
		open = false;
		onPush(row, ids);
	};
</script>

<Popover bind:open>
	<PopoverTrigger>
		{#snippet child({ props })}
			<button
				{...props}
				type="button"
				class={[
					'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs tabular-nums transition-colors hover:bg-muted',
					presentCount === cases.length
						? 'border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
						: 'text-muted-foreground'
				]}
				aria-label={`${row.first.ioc_value}: present in ${presentCount} of ${cases.length} cases`}
				data-testid="scope-ioc-cases"
			>
				<Check class="h-3 w-3" aria-hidden="true" />
				{presentCount} / {cases.length}
			</button>
		{/snippet}
	</PopoverTrigger>
	<PopoverContent align="start" class="w-80 p-0">
		{#if lists}
			<div class="border-b px-3 py-2">
				<p class="truncate font-mono text-xs" title={row.first.ioc_value}>{row.first.ioc_value}</p>
				<p class="text-2xs text-muted-foreground">
					In {presentCount} of {cases.length} cases
				</p>
				{#if cases.length > 8}
					<Input
						bind:value={search}
						placeholder="Search cases…"
						class="mt-2 h-7 text-xs"
						aria-label="Search cases"
					/>
				{/if}
			</div>
			<div class="max-h-72 overflow-y-auto text-xs">
				<p
					class="sticky top-0 bg-popover px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
				>
					Present ({lists.present.length})
				</p>
				<ul>
					{#each lists.present.slice(0, LIST_LIMIT) as c (c.case_id)}
						<li class="flex items-center gap-2 px-3 py-1">
							<Check class="h-3 w-3 shrink-0 text-emerald-600" aria-hidden="true" />
							<span class="min-w-0 flex-1 truncate">{caseLabel(c)}</span>
						</li>
					{/each}
				</ul>
				{#if lists.present.length > LIST_LIMIT}
					<p class="px-3 py-1 text-2xs text-muted-foreground">
						{lists.present.length - LIST_LIMIT} more — refine the search.
					</p>
				{/if}
				<p
					class="sticky top-0 bg-popover px-3 pb-1 pt-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground"
				>
					Missing ({lists.missing.length})
				</p>
				<ul>
					{#each lists.missing.slice(0, LIST_LIMIT) as c (c.case_id)}
						<li class="flex items-center gap-2 px-3 py-1">
							<span class="min-w-0 flex-1 truncate text-muted-foreground">{caseLabel(c)}</span>
							{#if canWrite}
								<button
									type="button"
									class="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
									onclick={() => {
										open = false;
										onPush(row, [c.case_id]);
									}}
									aria-label={`Push ${row.first.ioc_value} to case #${c.case_id}`}
									title={`Push to #${c.case_id}`}
								>
									<Plus class="h-3 w-3" />
								</button>
							{/if}
						</li>
					{/each}
				</ul>
				{#if lists.missing.length > LIST_LIMIT}
					<p class="px-3 py-1 text-2xs text-muted-foreground">
						{lists.missing.length - LIST_LIMIT} more — refine the search.
					</p>
				{/if}
			</div>
			{#if canWrite && presentCount < cases.length}
				<div class="border-t p-2">
					<Button
						size="sm"
						variant="outline"
						class="h-7 w-full gap-1.5 text-xs"
						onclick={pushMissing}
					>
						<Send class="h-3.5 w-3.5" /> Push to the {cases.length - presentCount} missing
					</Button>
				</div>
			{/if}
		{/if}
	</PopoverContent>
</Popover>

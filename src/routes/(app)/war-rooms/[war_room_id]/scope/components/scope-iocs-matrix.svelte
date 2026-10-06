<!--
  IOC presence matrix: one row per distinct indicator (same value, case
  and whitespace aside, whatever type each case filed it under), one
  column per readable attached case, a check where the case holds it.
  Past CASE_COLUMNS_MAX cases the per-case columns collapse into one
  "N / M" column whose popover lists present and missing cases, so the
  DOM stays rows x constant instead of rows x cases.
-->
<script lang="ts">
	import { Building2, Check, Plus, Send } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import type { ScopeCase } from '$lib/services/war-room-scope.service';
	import {
		SELECT_CHECKBOX_CLASS,
		distinctCustomers,
		iocTypeNames,
		missingCaseIds,
		showCaseColumns,
		type IocRow
	} from './helpers';
	import ScopeIocCasesPopover from './scope-ioc-cases-popover.svelte';

	type Props = {
		rows: IocRow[];
		cases: ScopeCase[];
		selected: string[];
		onSelectionChange: (next: string[]) => void;
		canWrite: boolean;
		/** Push the row's IOC into the given cases (pre-selected in the dialog). */
		onPush: (row: IocRow, caseIds: number[]) => void;
	};

	let { rows, cases, selected, onSelectionChange, canWrite, onPush }: Props = $props();

	const TH = 'h-10 px-2 text-left align-middle text-xs font-medium text-muted-foreground';
	const TD = 'px-2 py-1.5 align-middle';

	const selectedSet = $derived(new Set(selected));
	const allSelected = $derived(rows.length > 0 && rows.every((r) => selectedSet.has(r.key)));
	const someSelected = $derived(!allSelected && rows.some((r) => selectedSet.has(r.key)));

	const toggle = (key: string, on: boolean) => {
		const next = new Set(selected);
		if (on) next.add(key);
		else next.delete(key);
		onSelectionChange([...next]);
	};

	const toggleAll = () => {
		const keys = new Set(rows.map((r) => r.key));
		if (allSelected) onSelectionChange(selected.filter((k) => !keys.has(k)));
		else onSelectionChange([...new Set([...selected, ...keys])]);
	};

	const columns = $derived(showCaseColumns(cases.length));
	const caseIdSet = $derived(new Set(cases.map((c) => c.case_id)));

	/** Number of the listed cases holding the row's IOC. */
	const presentCount = (row: IocRow): number => {
		let n = 0;
		for (const id of row.caseIds) if (caseIdSet.has(id)) n += 1;
		return n;
	};

	const tlpClass = (name: string | null): string => {
		switch ((name ?? '').toLowerCase()) {
			case 'red':
				return 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300';
			case 'amber':
			case 'amber+strict':
				return 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300';
			case 'green':
				return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
			default:
				return 'border-border bg-muted text-muted-foreground';
		}
	};
</script>

<div class="max-h-[70vh] overflow-auto rounded-md border">
	<table class="w-full caption-bottom text-sm" data-testid="scope-iocs-matrix">
		<thead class="sticky top-0 z-10 bg-background [&_tr]:border-b">
			<tr class="border-b">
				<th class={`${TH} w-8`}>
					<Checkbox
						class={SELECT_CHECKBOX_CLASS}
						checked={allSelected}
						indeterminate={someSelected}
						onCheckedChange={toggleAll}
						aria-label="Select all visible IOCs"
					/>
				</th>
				<th class={TH}>Value</th>
				<th class={TH}>Type</th>
				<th class={TH}>TLP</th>
				{#if columns}
					{#each cases as c (c.case_id)}
						<th class={`${TH} text-center`} title={`#${c.case_id} ${c.case_name}`}>
							<span class="font-mono">#{c.case_id}</span>
							<span class="block max-w-[7rem] truncate text-2xs font-normal">{c.case_name}</span>
						</th>
					{/each}
				{:else}
					<th class={TH}>Cases</th>
				{/if}
				<th class={TH}>Customers</th>
				<th class={`${TH} w-10`}><span class="sr-only">Actions</span></th>
			</tr>
		</thead>
		<tbody class="[&_tr:last-child]:border-0">
			{#each rows as row (row.key)}
				{@const checked = selectedSet.has(row.key)}
				{@const present = presentCount(row)}
				{@const gapCount = cases.length - present}
				{@const customers = distinctCustomers(row.items)}
				<tr
					class={['border-b transition-colors hover:bg-muted/50', checked && 'bg-primary/5']}
					data-testid="scope-ioc-row"
					data-ioc-value={row.first.ioc_value}
				>
					<td class={TD}>
						<Checkbox
							class={SELECT_CHECKBOX_CLASS}
							{checked}
							onCheckedChange={(v) => toggle(row.key, !!v)}
							aria-label={`Select ${row.first.ioc_value}`}
						/>
					</td>
					<td class={`${TD} max-w-[22rem]`}>
						<p class="truncate font-mono text-xs" title={row.first.ioc_value}>
							{row.first.ioc_value}
						</p>
						{#if row.first.ioc_description}
							<p class="truncate text-2xs text-muted-foreground">{row.first.ioc_description}</p>
						{/if}
					</td>
					<td class={`${TD} text-xs text-muted-foreground`}>{iocTypeNames(row.items) || '—'}</td>
					<td class={TD}>
						{#if row.first.tlp_name}
							<span
								class={[
									'rounded-md border px-1.5 py-px text-2xs font-medium',
									tlpClass(row.first.tlp_name)
								]}
							>
								TLP:{row.first.tlp_name.toUpperCase()}
							</span>
						{:else}
							<span class="text-xs text-muted-foreground">—</span>
						{/if}
					</td>
					{#if !columns}
						<td class={TD}>
							<ScopeIocCasesPopover {row} {cases} presentCount={present} {canWrite} {onPush} />
						</td>
					{:else}
						{#each cases as c (c.case_id)}
							<td class={`${TD} text-center`}>
								{#if row.caseIds.has(c.case_id)}
									<span
										class="mx-auto flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 text-white shadow-sm dark:bg-emerald-600"
										role="img"
										aria-label={`Present in case #${c.case_id}`}
										title={`Present in #${c.case_id}`}
									>
										<Check class="h-4 w-4" strokeWidth={3} aria-hidden="true" />
									</span>
								{:else if canWrite}
									<button
										type="button"
										class="mx-auto flex h-6 w-6 items-center justify-center rounded-md border border-dashed border-muted-foreground/40 text-muted-foreground/70 transition-colors hover:border-primary hover:bg-primary/10 hover:text-primary"
										onclick={() => onPush(row, [c.case_id])}
										aria-label={`Push ${row.first.ioc_value} to case #${c.case_id}`}
										title={`Push to #${c.case_id}`}
									>
										<Plus class="h-3.5 w-3.5" />
									</button>
								{:else}
									<span class="text-xs text-muted-foreground/40" aria-label="Absent">·</span>
								{/if}
							</td>
						{/each}
					{/if}
					<td class={`${TD} text-xs text-muted-foreground`}>
						{#if customers.length > 1}
							<span
								class="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"
								title={customers.join(', ')}
							>
								<Building2 class="h-3 w-3" aria-hidden="true" />{customers.length}
							</span>
						{:else}
							{customers[0] ?? '—'}
						{/if}
					</td>
					<td class={TD}>
						{#if canWrite && gapCount > 0}
							<Button
								variant="ghost"
								size="icon"
								class="h-7 w-7 text-muted-foreground"
								onclick={() => onPush(row, missingCaseIds(row.caseIds, cases))}
								aria-label={`Push ${row.first.ioc_value} to the ${gapCount} cases missing it`}
								title="Push to cases missing it"
							>
								<Send class="h-3.5 w-3.5" />
							</Button>
						{/if}
					</td>
				</tr>
			{/each}
			{#if rows.length === 0}
				<tr>
					<td
						colspan={(columns ? cases.length : 1) + 6}
						class="p-6 text-center text-sm text-muted-foreground"
					>
						No IOC matches.
					</td>
				</tr>
			{/if}
		</tbody>
	</table>
</div>

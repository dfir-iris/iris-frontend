<!--
  Dashboard-level filter bar editor. The view-page filter bar at the top
  is derived from definition.filters_schema; this lets users add/remove
  entries, choose a type (date / reference / select) and pick the table+
  column reference for the lookup.

  filters_schema shape:
    [{ key, label, type: 'date'|'reference'|'select', table?, column?, options? }]
-->
<script lang="ts">
	import { ChevronDownIcon, ChevronUpIcon, PlusIcon, XIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import type { DashboardSchema } from '$lib/services/custom-dashboards.service';

	type FilterEntry = {
		key: string;
		label: string;
		type: 'date' | 'reference' | 'select';
		table?: string;
		column?: string;
	};

	type Props = {
		entries: FilterEntry[];
		schema: DashboardSchema | null;
		onChange: (entries: FilterEntry[]) => void;
	};

	let { entries, schema, onChange }: Props = $props();

	const tableOptions = $derived(schema?.tables ?? []);

	function patch(idx: number, updates: Partial<FilterEntry>) {
		const next = entries.map((e, i) => (i === idx ? { ...e, ...updates } : e));
		onChange(next);
	}

	function add() {
		onChange([
			...entries,
			{ key: `filter_${Date.now().toString(36)}`, label: 'New filter', type: 'date' }
		]);
	}

	function remove(idx: number) {
		onChange(entries.filter((_, i) => i !== idx));
	}

	function move(idx: number, delta: number) {
		const next = idx + delta;
		if (next < 0 || next >= entries.length) return;
		const copy = [...entries];
		[copy[idx], copy[next]] = [copy[next], copy[idx]];
		onChange(copy);
	}

	function columnsFor(table: string | undefined): string[] {
		if (!table || !schema) return [];
		return schema.columns[table] ?? [];
	}
</script>

<div class="flex flex-col gap-2">
	<div class="flex items-center justify-between">
		<span class="text-sm font-medium">Filter bar entries</span>
		<Button variant="outline" size="sm" onclick={add}>
			<PlusIcon class="size-3" /> Add filter
		</Button>
	</div>
	{#if entries.length === 0}
		<p class="text-xs text-muted-foreground">
			No filter-bar entries. The view page falls back to start/end date inputs.
		</p>
	{:else}
		<div class="flex flex-col gap-2">
			{#each entries as entry, idx (`${idx}-${entry.key}`)}
				<div
					class="grid grid-cols-1 items-end gap-2 rounded border p-2 sm:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]"
				>
					<div class="flex flex-col gap-1">
						<Label class="text-xs">Key</Label>
						<Input
							value={entry.key}
							oninput={(e) => patch(idx, { key: (e.target as HTMLInputElement).value })}
						/>
					</div>
					<div class="flex flex-col gap-1">
						<Label class="text-xs">Label</Label>
						<Input
							value={entry.label}
							oninput={(e) => patch(idx, { label: (e.target as HTMLInputElement).value })}
						/>
					</div>
					<div class="flex flex-col gap-1">
						<Label class="text-xs">Type</Label>
						<Select
							value={entry.type}
							onValueChange={(v) => patch(idx, { type: v as FilterEntry['type'] })}
							type="single"
						>
							<SelectTrigger>{entry.type}</SelectTrigger>
							<SelectContent>
								<SelectItem value="date">date</SelectItem>
								<SelectItem value="reference">reference</SelectItem>
								<SelectItem value="select">select</SelectItem>
							</SelectContent>
						</Select>
					</div>
					{#if entry.type === 'reference'}
						<div class="flex flex-col gap-1">
							<Label class="text-xs">Lookup table</Label>
							<Select
								value={entry.table ?? ''}
								onValueChange={(v) => patch(idx, { table: v, column: '' })}
								type="single"
							>
								<SelectTrigger>{entry.table || '—'}</SelectTrigger>
								<SelectContent>
									{#each tableOptions as t (t)}
										<SelectItem value={t}>{t}</SelectItem>
									{/each}
								</SelectContent>
							</Select>
						</div>
						<div class="flex flex-col gap-1">
							<Label class="text-xs">Lookup column</Label>
							<Select
								value={entry.column ?? ''}
								onValueChange={(v) => patch(idx, { column: v })}
								type="single"
							>
								<SelectTrigger>{entry.column || '—'}</SelectTrigger>
								<SelectContent>
									{#each columnsFor(entry.table) as c (c)}
										<SelectItem value={c}>{c}</SelectItem>
									{/each}
								</SelectContent>
							</Select>
						</div>
					{:else}
						<div></div>
						<div></div>
					{/if}
					<div class="flex items-center gap-1">
						<Button
							variant="ghost"
							size="icon"
							disabled={idx === 0}
							onclick={() => move(idx, -1)}
							title="Move up"
						>
							<ChevronUpIcon class="size-4" />
						</Button>
						<Button
							variant="ghost"
							size="icon"
							disabled={idx === entries.length - 1}
							onclick={() => move(idx, 1)}
							title="Move down"
						>
							<ChevronDownIcon class="size-4" />
						</Button>
						<Button variant="ghost" size="icon" onclick={() => remove(idx)} title="Remove">
							<XIcon class="size-4" />
						</Button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<!--
  One filter rule (table.column operator value). Value input swaps shape
  by operator: comma-list for in/nin, two inputs for between, single for
  the rest. Backend validates types per column.
-->
<script lang="ts">
	import { XIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import {
		Select,
		SelectContent,
		SelectItem,
		SelectTrigger
	} from '$lib/components/ui/select';
	import type {
		DashboardFilter,
		DashboardSchema
	} from '$lib/services/custom-dashboards.service';

	type Props = {
		filter: DashboardFilter;
		schema: DashboardSchema | null;
		onChange: (next: DashboardFilter) => void;
		onRemove: () => void;
	};

	let { filter, schema, onChange, onRemove }: Props = $props();

	const tableOptions = $derived(schema?.tables ?? []);
	const columnOptions = $derived(schema?.columns?.[filter.table] ?? []);
	const operatorOptions = $derived(schema?.operators ?? []);

	function patch(updates: Partial<DashboardFilter>) {
		onChange({ ...filter, ...updates });
	}

	function valueAsArray(): [string, string] {
		if (Array.isArray(filter.value) && filter.value.length === 2) {
			return [String(filter.value[0] ?? ''), String(filter.value[1] ?? '')];
		}
		return ['', ''];
	}
</script>

<div class="flex items-start gap-2">
	<div class="grow grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_1.5fr]">
		<Select value={filter.table ?? ''} onValueChange={(v) => patch({ table: v, column: '' })} type="single">
			<SelectTrigger>{filter.table || 'Table'}</SelectTrigger>
			<SelectContent>
				{#each tableOptions as t (t)}
					<SelectItem value={t}>{t}</SelectItem>
				{/each}
			</SelectContent>
		</Select>

		<Select value={filter.column ?? ''} onValueChange={(v) => patch({ column: v })} type="single">
			<SelectTrigger>{filter.column || 'Column'}</SelectTrigger>
			<SelectContent>
				{#each columnOptions as c (c)}
					<SelectItem value={c}>{c}</SelectItem>
				{/each}
			</SelectContent>
		</Select>

		<Select value={filter.operator ?? ''} onValueChange={(v) => patch({ operator: v })} type="single">
			<SelectTrigger>{filter.operator || 'Operator'}</SelectTrigger>
			<SelectContent>
				{#each operatorOptions as o (o)}
					<SelectItem value={o}>{o}</SelectItem>
				{/each}
			</SelectContent>
		</Select>

		{#if filter.operator === 'between'}
			{@const [lo, hi] = valueAsArray()}
			<div class="flex gap-1">
				<Input
					placeholder="from"
					value={lo}
					oninput={(e) => patch({ value: [(e.target as HTMLInputElement).value, hi] })}
				/>
				<Input
					placeholder="to"
					value={hi}
					oninput={(e) => patch({ value: [lo, (e.target as HTMLInputElement).value] })}
				/>
			</div>
		{:else if filter.operator === 'in' || filter.operator === 'nin'}
			<Input
				placeholder="comma-separated values"
				value={Array.isArray(filter.value) ? filter.value.join(',') : String(filter.value ?? '')}
				oninput={(e) =>
					patch({
						value: (e.target as HTMLInputElement).value
							.split(',')
							.map((v) => v.trim())
							.filter((v) => v.length > 0)
					})
				}
			/>
		{:else}
			<Input
				placeholder="value"
				value={Array.isArray(filter.value) ? '' : String(filter.value ?? '')}
				oninput={(e) => patch({ value: (e.target as HTMLInputElement).value })}
			/>
		{/if}
	</div>
	<Button variant="ghost" size="icon" onclick={onRemove} title="Remove filter">
		<XIcon class="size-4" />
	</Button>
</div>

<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Select } from '$lib/components/ui/select';
	import SelectTrigger from '$lib/components/ui/select/select-trigger.svelte';
	import SelectContent from '$lib/components/ui/select/select-content.svelte';
	import SelectItem from '$lib/components/ui/select/select-item.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import type { FilterDef, FilterLogic, FilterOperation, FilterRow } from './filters';

	type Props = {
		defs: FilterDef<unknown>[];
		logic: FilterLogic;
		filters: FilterRow[];
		onLogicChange: (logic: FilterLogic) => void;
		onFiltersChange: (filters: FilterRow[]) => void;
	};

	const OPERATIONS: { value: FilterOperation; label: string; needsValue: boolean }[] = [
		{ value: 'equals', label: 'Equals', needsValue: true },
		{ value: 'not', label: 'Not', needsValue: true },
		{ value: 'starts_with', label: 'Starts With', needsValue: true },
		{ value: 'not_starts_with', label: 'Does Not Start With', needsValue: true },
		{ value: 'contains', label: 'Contains', needsValue: true },
		{ value: 'not_contains', label: 'Does Not Contain', needsValue: true },
		{ value: 'ends_with', label: 'Ends With', needsValue: true },
		{ value: 'not_ends_with', label: 'Does Not End With', needsValue: true },
		{ value: 'empty', label: 'Empty', needsValue: false },
		{ value: 'not_empty', label: 'Not Empty', needsValue: false }
	];

	const addFilter = () => {
		const first = defs[0];
		if (!first) return;

		onFiltersChange([...filters, { fieldId: first.id, operation: 'contains', value: '' }]);
	};

	const removeFilter = (idx: number) => {
		onFiltersChange(filters.filter((_, i) => i !== idx));
	};

	const setField = (idx: number, fieldId: string) => {
		const next = filters.slice();
		next[idx] = { ...next[idx], fieldId };
		onFiltersChange(next);
	};

	const setOperation = (idx: number, operation: FilterOperation) => {
		const next = filters.slice();
		const needsValue = OPERATIONS.find((o) => o.value === operation)?.needsValue ?? true;
		next[idx] = { ...next[idx], operation: operation, value: needsValue ? next[idx].value : '' };
		onFiltersChange(next);
	};

	const setValue = (idx: number, value: string) => {
		const next = filters.slice();
		next[idx] = { ...next[idx], value };
		onFiltersChange(next);
	};

	const operationNeedsValue = (operation: FilterOperation) =>
		OPERATIONS.find((o) => o.value === operation)?.needsValue ?? true;

	let { defs, logic, filters, onLogicChange, onFiltersChange }: Props = $props();
</script>

<div class="flex items-stretch gap-3">
	<div class="flex w-12 shrink-0 flex-col items-center justify-between rounded bg-muted/60 py-3">
		<button
			class="rotate-90 text-sm font-medium"
			onclick={() => onLogicChange(logic === 'and' ? 'or' : 'and')}
		>
			{logic === 'and' ? 'And' : 'Or'}
		</button>

		<button class="text-lg leading-none" onclick={() => onFiltersChange([])}> &times; </button>
	</div>

	<div class="flex grow flex-col gap-3">
		<div class="text-sm font-medium">Filters ({filters.length})</div>

		{#each filters as f, idx (idx)}
			<div class="flex gap-3">
				<div class="w-48">
					<Select value={f.fieldId} onValueChange={(v) => setField(idx, v)} type="single">
						<SelectTrigger>
							{defs.find((d) => d.id === f.fieldId)?.label ?? 'Field'}
						</SelectTrigger>
						<SelectContent>
							{#each defs as d}
								<SelectItem value={d.id}>{d.label}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				</div>

				<div class="w-64">
					<Select
						value={f.operation}
						onValueChange={(v) => setOperation(idx, v as FilterOperation)}
						type="single"
					>
						<SelectTrigger>
							{OPERATIONS.find((o) => o.value === f.operation)?.label ?? 'Operator'}
						</SelectTrigger>
						<SelectContent>
							{#each OPERATIONS as o}
								<SelectItem value={o.value}>{o.label}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				</div>

				<Input
					class="w-full rounded-md border bg-background text-sm disabled:opacity-60"
					placeholder="Value"
					disabled={!operationNeedsValue(f.operation)}
					value={f.value}
					oninput={(e) => setValue(idx, (e.currentTarget as HTMLInputElement).value)}
				/>

				<Button variant="ghost" onclick={() => removeFilter(idx)}>&times;</Button>
			</div>
		{/each}

		<div>
			<Button variant="secondary" onclick={addFilter}>Add filter</Button>
		</div>
	</div>
</div>

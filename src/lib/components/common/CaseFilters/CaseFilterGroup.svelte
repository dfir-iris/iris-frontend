<!--
  Recursive filter group node. Renders the group's logic toggle and
  one row per item; each item is either a leaf condition (field /
  operator / value picker) or a nested CaseFilterGroup. Used by
  CaseFilters; recurses via `<svelte:self>`.

  The component is value-controlled: it owns no state, every mutation
  goes through `onChange(nextGroup)` so the page can react / persist /
  emit.
-->
<script lang="ts">
	import { PlusIcon, XIcon, FoldersIcon } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Select } from '$lib/components/ui/select';
	import SelectTrigger from '$lib/components/ui/select/select-trigger.svelte';
	import SelectContent from '$lib/components/ui/select/select-content.svelte';
	import SelectItem from '$lib/components/ui/select/select-item.svelte';
	import type {
		FilterDef,
		FilterGroup,
		FilterLogic,
		FilterOperation,
		FilterRow,
		FilterTreeNode
	} from './filters';
	import { isGroup, emptyGroup } from './filters';

	type Props = {
		defs: FilterDef<unknown>[];
		group: FilterGroup;
		onChange: (next: FilterGroup) => void;
		/** Pressing Enter in a value input triggers this — the page
		 *  uses it to apply filters without a button click. */
		onApply?: () => void;
		/** True for the page's root group; only used to drop the
		 *  delete-group affordance from the root. */
		isRoot?: boolean;
		/** Nesting depth (root = 0). Used to colour the group border
		 *  so a deeply nested tree stays readable. */
		depth?: number;
	};

	let { defs, group, onChange, onApply, isRoot = false, depth = 0 }: Props = $props();

	const OPERATIONS: { value: FilterOperation; label: string; needsValue: boolean }[] = [
		{ value: 'equals', label: 'Equals', needsValue: true },
		{ value: 'not', label: 'Not equals', needsValue: true },
		{ value: 'contains', label: 'Contains', needsValue: true },
		{ value: 'not_contains', label: "Doesn't contain", needsValue: true },
		{ value: 'starts_with', label: 'Starts with', needsValue: true },
		{ value: 'not_starts_with', label: "Doesn't start with", needsValue: true },
		{ value: 'ends_with', label: 'Ends with', needsValue: true },
		{ value: 'not_ends_with', label: "Doesn't end with", needsValue: true },
		{ value: 'empty', label: 'Is empty', needsValue: false },
		{ value: 'not_empty', label: 'Is not empty', needsValue: false }
	];

	const operationNeedsValue = (operation: FilterOperation) =>
		OPERATIONS.find((o) => o.value === operation)?.needsValue ?? true;

	// Value-picker (dropdown) fields — Owner, Severity, Customer, State —
	// emit exact strings from a fixed list. That's the right control for
	// `equals` / `not equals`, but the substring operators (contains,
	// starts_with, ends_with, and their negations) compare partial
	// strings server-side: picking a full login for `starts_with` never
	// matches anything sensible. For those ops we drop back to the
	// free-text input even when the field has a picker.
	const SUBSTRING_OPS: FilterOperation[] = [
		'contains',
		'not_contains',
		'starts_with',
		'not_starts_with',
		'ends_with',
		'not_ends_with'
	];
	const usePickerFor = (operation: FilterOperation) =>
		!SUBSTRING_OPS.includes(operation);

	const setLogic = (logic: FilterLogic) => onChange({ ...group, logic });

	const updateItem = (idx: number, next: FilterTreeNode) => {
		const items = group.items.slice();
		items[idx] = next;
		onChange({ ...group, items });
	};

	const removeItem = (idx: number) => {
		onChange({ ...group, items: group.items.filter((_, i) => i !== idx) });
	};

	const addCondition = () => {
		const first = defs[0];
		if (!first) return;
		const row: FilterRow = { fieldId: first.id, operation: 'contains', value: '' };
		onChange({ ...group, items: [...group.items, row] });
	};

	const addGroup = () => {
		// Default new sub-group to the opposite logic — that's almost
		// always what users want when they reach for nesting (otherwise
		// the AND/OR inside collapses into the parent's logic).
		const childLogic: FilterLogic = group.logic === 'and' ? 'or' : 'and';
		onChange({ ...group, items: [...group.items, emptyGroup(childLogic)] });
	};

	const setField = (idx: number, fieldId: string) => {
		const node = group.items[idx];
		if (isGroup(node)) return;
		const def = defs.find((d) => d.id === fieldId);
		// Only wipe the current value when the new field forces the value
		// picker AND the picker's fixed options don't cover it. Substring
		// operators bypass the picker (see usePickerFor), so keep the
		// free-text value in that case even when the field has options.
		const pickerActive =
			!!def?.valueOptions && def.valueOptions.length > 0 && usePickerFor(node.operation);
		const stillValid =
			!pickerActive || def!.valueOptions!.some((o) => o.value === node.value);
		updateItem(idx, { ...node, fieldId, value: stillValid ? node.value : '' });
	};

	const setOperation = (idx: number, op: FilterOperation) => {
		const node = group.items[idx];
		if (isGroup(node)) return;
		const needsValue = OPERATIONS.find((o) => o.value === op)?.needsValue ?? true;
		updateItem(idx, { ...node, operation: op, value: needsValue ? node.value : '' });
	};

	const setValue = (idx: number, value: string) => {
		const node = group.items[idx];
		if (isGroup(node)) return;
		updateItem(idx, { ...node, value });
	};
</script>

<div
	class={`flex flex-col gap-2 rounded-lg border ${depth === 0 ? 'border-border/60 bg-muted/20' : depth === 1 ? 'border-primary/30 bg-primary/5' : 'border-amber-500/30 bg-amber-500/5'} p-3`}
>
	<div class="flex items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<span class="text-2xs uppercase tracking-wider text-muted-foreground">
				{isRoot ? 'Match' : 'Sub-group'}
			</span>
			<div class="inline-flex overflow-hidden rounded-md border border-border/60">
				<button
					type="button"
					class={`px-3 py-1 text-xs font-medium transition-colors ${
						group.logic === 'and' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
					}`}
					onclick={() => setLogic('and')}
				>
					All (AND)
				</button>
				<button
					type="button"
					class={`px-3 py-1 text-xs font-medium transition-colors ${
						group.logic === 'or' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
					}`}
					onclick={() => setLogic('or')}
				>
					Any (OR)
				</button>
			</div>
			<span class="text-xs text-muted-foreground">
				{group.items.length} {group.items.length === 1 ? 'item' : 'items'}
			</span>
		</div>

		{#if !isRoot}
			<Button
				variant="ghost"
				size="icon"
				class="size-7 text-muted-foreground hover:text-destructive"
				aria-label="Remove sub-group"
				onclick={() => onChange({ ...group, items: [] })}
			>
				<XIcon class="size-4" />
			</Button>
		{/if}
	</div>

	<div class="flex flex-col gap-2">
		{#each group.items as item, idx (idx)}
			{#if isGroup(item)}
				<!--
				  Recursion. `<svelte:self>` instances render their own
				  delete button (above) which targets the *parent's*
				  items array via the `onChange` we pass here.
				-->
				<div class="flex items-start gap-2">
					<div class="min-w-0 flex-1">
						<svelte:self
							{defs}
							group={item}
							depth={depth + 1}
							onChange={(next: FilterGroup) => updateItem(idx, next)}
							{onApply}
						/>
					</div>
					<Button
						variant="ghost"
						size="icon"
						class="size-9 shrink-0 text-muted-foreground hover:text-destructive"
						aria-label="Remove sub-group"
						onclick={() => removeItem(idx)}
					>
						<XIcon class="size-4" />
					</Button>
				</div>
			{:else}
				{@const f = item as FilterRow}
				{@const fieldDef = defs.find((d) => d.id === f.fieldId)}
				<div class="grid grid-cols-[minmax(140px,1fr)_minmax(180px,1fr)_minmax(200px,2fr)_auto] gap-2">
					<Select value={f.fieldId} onValueChange={(v) => setField(idx, v)} type="single">
						<SelectTrigger>{fieldDef?.label ?? 'Field'}</SelectTrigger>
						<SelectContent class="max-h-72 overflow-y-auto">
							{#each defs as d (d.id)}
								<SelectItem value={d.id}>{d.label}</SelectItem>
							{/each}
						</SelectContent>
					</Select>

					<Select
						value={f.operation}
						onValueChange={(v) => setOperation(idx, v as FilterOperation)}
						type="single"
					>
						<SelectTrigger>
							{OPERATIONS.find((o) => o.value === f.operation)?.label ?? 'Operator'}
						</SelectTrigger>
						<SelectContent>
							{#each OPERATIONS as o (o.value)}
								<SelectItem value={o.value}>{o.label}</SelectItem>
							{/each}
						</SelectContent>
					</Select>

					{#if !operationNeedsValue(f.operation)}
						<Input
							class="rounded-md border bg-background text-sm disabled:opacity-60"
							placeholder="No value required"
							disabled
							value=""
						/>
					{:else if fieldDef?.valueOptions && fieldDef.valueOptions.length > 0 && usePickerFor(f.operation)}
						<Select value={f.value} onValueChange={(v) => setValue(idx, v)} type="single">
							<SelectTrigger>
								{fieldDef.valueOptions.find((o) => o.value === f.value)?.label ?? 'Pick a value'}
							</SelectTrigger>
							<SelectContent class="max-h-72 overflow-y-auto">
								{#each fieldDef.valueOptions as opt (opt.value)}
									<SelectItem value={opt.value}>{opt.label}</SelectItem>
								{/each}
							</SelectContent>
						</Select>
					{:else}
						<Input
							class="rounded-md border bg-background text-sm disabled:opacity-60"
							placeholder="Value"
							value={f.value}
							oninput={(e) => setValue(idx, (e.currentTarget as HTMLInputElement).value)}
							onkeydown={(e) => {
								if (e.key === 'Enter' && onApply) {
									e.preventDefault();
									onApply();
								}
							}}
						/>
					{/if}

					<Button
						variant="ghost"
						size="icon"
						class="size-9 text-muted-foreground hover:text-destructive"
						aria-label="Remove condition"
						onclick={() => removeItem(idx)}
					>
						<XIcon class="size-4" />
					</Button>
				</div>
			{/if}
		{/each}

		<div class="flex flex-wrap gap-2">
			<Button variant="outline" size="sm" onclick={addCondition} class="gap-1">
				<PlusIcon class="size-3.5" />
				Add condition
			</Button>
			<Button
				variant="outline"
				size="sm"
				onclick={addGroup}
				class="gap-1"
				title="Wrap upcoming conditions in their own AND/OR group"
			>
				<FoldersIcon class="size-3.5" />
				Add sub-group
			</Button>
		</div>
	</div>
</div>

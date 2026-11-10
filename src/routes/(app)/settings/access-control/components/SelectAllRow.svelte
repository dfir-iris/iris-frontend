<!--
  "Select all" header of a checkbox list: ticks or unticks every row
  shown (the filter applies), keeping what the filter hides.
-->
<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { selectionState, selectionToggleAll } from '../selection';

	type Props = {
		/** Ids of the rows shown that can be ticked. */
		ids: number[];
		selected: Set<number>;
		disabled?: boolean;
		onChange: (next: Set<number>) => void;
	};

	let { ids, selected, disabled = false, onChange }: Props = $props();

	const state = $derived(selectionState(selected, ids));
</script>

<label
	class="sticky top-0 z-10 flex items-center gap-2 border-b bg-card px-3 py-1.5 text-2xs text-muted-foreground {disabled ||
	ids.length === 0
		? 'cursor-not-allowed'
		: 'cursor-pointer hover:bg-muted/30'}"
>
	<Checkbox
		checked={state === 'all'}
		indeterminate={state === 'some'}
		onCheckedChange={() => onChange(selectionToggleAll(selected, ids))}
		disabled={disabled || ids.length === 0}
		aria-label="Select all"
	/>
	<span class="flex-1">Select all ({ids.length})</span>
	<span>{selected.size} selected</span>
</label>

<!--
  Cases overview filter builder. Hosts the root `CaseFilterGroup` and
  surfaces the Apply / Clear actions next to the group.

  The tree is value-controlled: callers own the FilterGroup state and
  receive it back via `onChange`. That keeps URL-syncing and saved-
  filter persistence in the page where the rest of the query state
  lives.
-->
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import CaseFilterGroup from './CaseFilterGroup.svelte';
	import type { FilterDef, FilterGroup } from './filters';
	import { treeHasActiveCondition } from './filters';

	type Props = {
		defs: FilterDef<unknown>[];
		group: FilterGroup;
		onChange: (next: FilterGroup) => void;
		onApply?: () => void;
		onClear?: () => void;
	};

	let { defs, group, onChange, onApply, onClear }: Props = $props();

	const hasActive = $derived(treeHasActiveCondition(group));
</script>

<div class="flex flex-col gap-3">
	<div class="flex items-center justify-end gap-2">
		{#if onClear}
			<Button variant="ghost" size="sm" onclick={onClear} disabled={!hasActive}>Clear</Button>
		{/if}
		{#if onApply}
			<Button size="sm" onclick={onApply} disabled={!hasActive}>Apply</Button>
		{/if}
	</div>

	<CaseFilterGroup {defs} {group} {onChange} {onApply} isRoot depth={0} />
</div>

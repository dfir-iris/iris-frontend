<!--
  Cases overview filter builder. Hosts the root `CaseFilterGroup` and
  the Apply / Clear actions.

  Actions sit *below* the conditions: you build the filter, then act on
  it. Above the group they read as belonging to whatever the page put
  before the builder, which is how the overview toolbar ended up with a
  stranded Apply button.

  The tree is value-controlled: callers own the FilterGroup state and
  receive it back via `onChange`. That keeps URL-syncing and saved-
  filter persistence in the page where the rest of the query state
  lives.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
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
		/**
		 * Extra controls for the left of the action bar. The overview puts
		 * "Save filter" here so persisting a filter sits with applying it
		 * rather than in the page header, above the thing it saves.
		 */
		footerStart?: Snippet;
	};

	let { defs, group, onChange, onApply, onClear, footerStart }: Props = $props();

	const hasActive = $derived(treeHasActiveCondition(group));
</script>

<!--
  `min-h-0` so this can be shorter than its conditions when the host
  bounds it (the cases overview caps the panel at a share of the page);
  without it a flex parent has no way to squeeze this and the tree just
  overflows. Unbounded hosts are unaffected — nothing here asks to grow.
-->
<div class="flex min-h-0 flex-col gap-3">
	<!--
	  The conditions scroll, the action bar does not. Eleven conditions
	  outgrow any panel this sits in, and an Apply button that has been
	  pushed off the bottom of the page is worse than a scrollbar.
	-->
	<div class="min-h-0 flex-1 overflow-y-auto">
		<CaseFilterGroup {defs} {group} {onChange} {onApply} isRoot depth={0} />
	</div>

	{#if footerStart || onClear || onApply}
		<div class="flex shrink-0 items-center gap-2">
			{#if footerStart}{@render footerStart()}{/if}

			<div class="ml-auto flex items-center gap-2">
				{#if onClear}
					<Button variant="ghost" size="sm" onclick={onClear} disabled={!hasActive}>Clear</Button>
				{/if}
				{#if onApply}
					<Button size="sm" onclick={onApply} disabled={!hasActive}>Apply</Button>
				{/if}
			</div>
		</div>
	{/if}
</div>

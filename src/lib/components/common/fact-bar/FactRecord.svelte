<!--
  Provenance line closing the detail pane: ids, uuids, timestamps. Dimmed and
  below the description because it is looked up rarely — but it has to stay
  somewhere now that the pane no longer has a metadata footer bar.
-->
<script lang="ts">
	import { cn } from '$lib/utils';

	/** `[label, value, mono?]`. Entries with no value are dropped. */
	type Item = [string, string | number | null | undefined, boolean?];

	let { items }: { items: Item[] } = $props();

	const shown = $derived(
		items.filter(([, value]) => value !== null && value !== undefined && value !== '')
	);
</script>

{#if shown.length}
	<div
		class="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/70 pt-2 text-2xs text-muted-foreground"
	>
		{#each shown as [label, value, mono] (label)}
			<span>
				{label}
				<span class={cn('text-foreground/70', mono && 'font-mono')}>{value}</span>
			</span>
		{/each}
	</div>
{/if}

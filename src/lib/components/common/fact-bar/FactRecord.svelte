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
	<!--
	  VISUAL TEST (lighter chrome): the `border-t` is replaced by whitespace.
	  This line is already the dimmest thing in the pane and sits at the very
	  bottom — the extra margin separates it just as well as a rule did.
	-->
	<div class="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-2xs text-muted-foreground">
		{#each shown as [label, value, mono] (label)}
			<span>
				{label}
				<span class={cn('text-foreground/70', mono && 'font-mono')}>{value}</span>
			</span>
		{/each}
	</div>
{/if}

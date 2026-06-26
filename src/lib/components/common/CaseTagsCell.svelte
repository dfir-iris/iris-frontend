<!--
  Tags cell for the cases overview table. Shows up to three tag chips
  inline and collapses the rest into a "+N" pill so the row doesn't
  blow up vertically when a case has many tags.
-->
<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import type { Tags } from '$lib/types/resources/case';

	type Props = {
		tags: Tags[];
		max?: number;
	};

	let { tags, max = 3 }: Props = $props();

	const visible = $derived(tags.slice(0, max));
	const overflow = $derived(Math.max(0, tags.length - max));
</script>

<!--
  Renders inside the data-table's `<td>` wrapper, so this component
  must NOT emit its own `<td>` — emit the cell *contents* only.
-->
{#if tags.length === 0}
	<span class="text-2xs text-muted-foreground">—</span>
{:else}
	<div class="flex flex-wrap gap-1">
		<!--
		  Key by index — the cases list endpoint sometimes returns tags
		  without a `tag_id`, so keying on the id makes Svelte see two
		  `undefined` keys and crash. The list is read-only and replaced
		  wholesale on row reload, so positional keys are safe.
		-->
		{#each visible as tag, i (i)}
			<Badge variant="secondary" class="max-w-[8rem] truncate text-2xs">{tag.tag_title}</Badge>
		{/each}
		{#if overflow > 0}
			<Badge variant="outline" class="text-2xs">+{overflow}</Badge>
		{/if}
	</div>
{/if}

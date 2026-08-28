<!--
  Title cell for the cases overview table. Clicking the title opens
  the CaseDetailModal (quick-peek) — to *navigate* into the case
  workspace the user has the "Open case" CTA at the bottom of the
  modal. This matches the old jQuery UI where the title was a modal
  trigger, not a router link.
-->
<script lang="ts">
	import type { Case } from '$lib/types/resources/case';

	type Props = {
		row: Case;
		onOpen: (row: Case) => void;
	};

	let { row, onOpen }: Props = $props();
</script>

<!--
  Renders inside the data-table's `<td>` wrapper, so this component
  must NOT emit its own `<td>` — emit the cell *contents* only.
-->
<div class="flex flex-col">
	<button
		type="button"
		class="w-fit max-w-full truncate text-left text-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none"
		onclick={() => onOpen(row)}
		title="Quick peek at case #{row.case_id}"
	>
		{row.case_name}
	</button>
	{#if row.case_soc_id}
		<span class="mt-0.5 text-2xs text-muted-foreground">#{row.case_id} · SOC {row.case_soc_id}</span
		>
	{:else}
		<span class="mt-0.5 text-2xs text-muted-foreground">#{row.case_id}</span>
	{/if}
</div>

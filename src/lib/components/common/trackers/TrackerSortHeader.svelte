<!--
  A sortable header cell of a tracker table: a click sorts ascending,
  then descending, then back to the tracker order.
-->
<script lang="ts">
	import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-svelte';
	import type { TrackerSort } from './tracker-layout';

	type Props = {
		label: string;
		/** The sort key of the column (`item`, `col:<key>`…). */
		sortKey: string;
		sort: TrackerSort | null;
		onSort: (key: string) => void;
		class?: string;
	};

	let { label, sortKey, sort, onSort, class: className = '' }: Props = $props();

	const dir = $derived(sort?.key === sortKey ? sort.dir : null);
</script>

<th
	class={className}
	aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
>
	<button
		type="button"
		class="group inline-flex items-center gap-1 rounded hover:text-foreground {dir
			? 'text-foreground'
			: ''}"
		onclick={() => onSort(sortKey)}
		title={dir === 'asc'
			? `Sorted by ${label}, ascending — click for descending`
			: dir === 'desc'
				? `Sorted by ${label}, descending — click to stop sorting`
				: `Sort by ${label}`}
		data-testid="tracker-sort-{sortKey}"
	>
		{label}
		{#if dir === 'asc'}
			<ArrowUp class="h-3 w-3" aria-hidden="true" />
		{:else if dir === 'desc'}
			<ArrowDown class="h-3 w-3" aria-hidden="true" />
		{:else}
			<ArrowUpDown class="h-3 w-3 opacity-0 group-hover:opacity-60" aria-hidden="true" />
		{/if}
	</button>
</th>

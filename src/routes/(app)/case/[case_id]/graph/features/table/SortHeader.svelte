<!-- Sortable column header (asc → desc → unsorted), with aria-sort. -->
<script lang="ts" module>
	// Lets ESLint's `no-undef` see the name; the real `C` comes from the
	// `generics` attribute below (same shim as TaskKanbanBoard.svelte).
	type C = string;
</script>

<script lang="ts" generics="C extends string">
	import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon } from 'lucide-svelte';
	import { ariaSort, nextSort, type SortState } from '../../lib/table';

	interface Props {
		column: C;
		label: string;
		sort: SortState<C> | null;
		onSort: (next: SortState<C> | null) => void;
		class?: string;
		align?: 'left' | 'right';
	}

	let { column, label, sort, onSort, class: className = '', align = 'left' }: Props = $props();

	const state = $derived(ariaSort(sort, column));
</script>

<th scope="col" aria-sort={state} class="whitespace-nowrap px-2 py-1.5 font-medium {className}">
	<button
		type="button"
		class="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring {align ===
		'right'
			? 'flex-row-reverse'
			: ''}"
		onclick={() => onSort(nextSort(sort, column))}
	>
		{label}
		{#if state === 'ascending'}
			<ArrowUpIcon class="h-3 w-3" aria-hidden="true" />
		{:else if state === 'descending'}
			<ArrowDownIcon class="h-3 w-3" aria-hidden="true" />
		{:else}
			<ArrowUpDownIcon class="h-3 w-3 opacity-30" aria-hidden="true" />
		{/if}
	</button>
</th>

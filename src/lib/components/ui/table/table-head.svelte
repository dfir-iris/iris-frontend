<script lang="ts">
	import { cn } from '$lib/utils.js';
	import Button from '../button/button.svelte';
	import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, FilterIcon } from 'lucide-svelte';
	import type { Snippet } from 'svelte';

	// Props
	let {
		class: className,
		sortDirection,
		toggleSort = () => {
			sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
		},
		toggleFilter = () => {},
		children,
		...restProps
	}: {
		class: string;
		sortDirection?: 'asc' | 'desc';
		toggleSort?: () => void;
		toggleFilter?: () => void;
		children: Snippet;
	} = $props();
</script>

<th
	class={cn(
		'h-10 px-2 text-left align-middle font-medium text-muted-foreground first:pl-6 last:pr-6 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
		className
	)}
	{...restProps}
>
	<div class="flex w-full flex-row items-center">
		<div class="mr-auto">{@render children()}</div>

		<!-- Filtering control -->
		{#if toggleFilter}
			<Button onclick={toggleFilter} variant="ghost" class="top-0 h-fit p-1">
				<FilterIcon class="h-4 w-4 !stroke-2" />
			</Button>
		{/if}

		<!-- Sorting control -->
		{#if toggleSort}
			<Button onclick={toggleSort} variant="ghost" class="top-0 h-fit p-1">
				{@const SortIcon =
					sortDirection === 'asc'
						? ArrowUpIcon
						: sortDirection === 'desc'
							? ArrowDownIcon
							: ArrowUpDownIcon}
				<SortIcon class="h-4 w-4 !stroke-2" />
			</Button>
		{/if}
	</div>
</th>
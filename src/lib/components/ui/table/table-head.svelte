<script lang="ts">
	import type { HTMLThAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';
	import Button from '../button/button.svelte';
	import { SortAscIcon, SortDescIcon } from 'lucide-svelte';

	type $$Props = HTMLThAttributes;

	let className: $$Props['class'] = undefined;
	export { className as class };

	// Sorting properties
	export let sortDirection: string | 'asc' | 'desc' | undefined = undefined;
	export let toggleSort = undefined;
</script>

<th
	class={cn(
		'h-10 px-2 text-left align-middle font-medium text-muted-foreground first:pl-6 last:pr-6 [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
		className
	)}
	{...$$restProps}
>
	<div class="flex w-full flex-row items-center">
		<div class="mr-auto"><slot /></div>

		<!-- Sorting control -->
		{#if toggleSort}
			<Button on:click={toggleSort} variant="ghost" class="top-0 h-fit p-1">
				{@const SortIcon = sortDirection === 'asc' ? SortAscIcon : SortDescIcon}
				<SortIcon class="!h-4 !w-4" />
			</Button>
		{/if}
	</div>
</th>

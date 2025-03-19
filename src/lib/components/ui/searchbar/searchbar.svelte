<script lang="ts">
	import { SearchIcon, XIcon } from 'lucide-svelte';
	import { Input } from '../input';

	let {
		value = $bindable(),
		placeholder = 'Search'
	}: {
		value: string;
		placeholder?: string;
	} = $props();
	
	// Function to clear the search input
	function clearSearch() {
		value = '';
	}
</script>

<div class="group relative">
	<Input bind:value type="text" {placeholder} class="bg-background pl-8 pr-8 dark:bg-muted"></Input>
	<SearchIcon class="absolute left-2 top-2 !h-5 !w-5 opacity-70 group-focus-within:opacity-100" />
	
	{#if value}
		<button 
			type="button"
			class="absolute right-2 top-2 !h-5 !w-5 rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
			on:click={clearSearch}
			aria-label="Clear search"
		>
			<XIcon class="!h-5 !w-5" />
		</button>
	{/if}
</div>
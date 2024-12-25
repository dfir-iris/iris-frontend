<script lang="ts">
	import { SearchIcon } from 'lucide-svelte';
	import { Input } from '../input';

	let {
		value = $bindable(),
		placeholder = 'Search'
	}: {
		value: string;
		placeholder?: string;
	} = $props();
</script>

<div class="group relative">
	<Input bind:value type="text" {placeholder} class="bg-background pl-8"></Input>
	<SearchIcon class="absolute left-2 top-2 !h-5 !w-5 opacity-70 group-focus-within:opacity-100" />
</div>

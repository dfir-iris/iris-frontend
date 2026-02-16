<script lang="ts">
	import { ChevronDownIcon } from 'lucide-svelte';

	export let collapsed;

	let minimized = true;
</script>

<div class={`flex w-full flex-col ${collapsed ? 'max-w-32' : 'max-w-auto'}`}>
	<button
		class="flex w-full cursor-pointer items-center justify-center"
		on:click={() => (minimized = !minimized)}
	>
		<slot name="trigger"></slot>

		{#if !collapsed}
			<div class={`flex font-bold transition-all ${!minimized ? 'rotate-180' : ''}`}>
				<ChevronDownIcon />
			</div>
		{/if}
	</button>

	<ul
		class={`flex h-auto w-full flex-col items-center overflow-hidden pl-4 text-gray-600 transition-all dark:text-gray-200 ${minimized ? 'max-h-0' : 'max-h-96'} ${collapsed ? 'pl-2.5' : 'pl-1'}`}
	>
		<slot name="menu"></slot>
	</ul>
</div>

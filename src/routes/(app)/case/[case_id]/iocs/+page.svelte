<script lang="ts">
	import IOCCard from '$lib/components/common/ioc/IOCCard.svelte';
	import { Button } from '$lib/components/ui/button';
	import { PlusCircleIcon } from 'lucide-svelte';
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const iocs = $derived(data.iocs);
	const caseId = $derived($page.params.case_id);
</script>

<div class="flex flex-col h-full">
	<div class="p-4 border-b">
		<Button href={`/case/${caseId}/iocs/new`} variant="outline">
			<PlusCircleIcon class="mr-2 h-4 w-4" />
			Add IOC
		</Button>
	</div>

	{#if iocs && iocs.length > 0}
		<div class="p-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 overflow-y-auto">
			{#each iocs as ioc (ioc.ioc_id)}
				<IOCCard {ioc} case_id={caseId} />
			{/each}
		</div>
	{:else if !iocs}
		<div class="flex flex-col items-center justify-center h-full">
			<p class="text-muted-foreground">Loading IOCs...</p>
		</div>
	{:else}
		<div class="flex flex-col items-center justify-center h-full p-8 text-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				width="24"
				height="24"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				stroke-width="2"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="w-16 h-16 text-muted-foreground mb-4"
			>
				<circle cx="12" cy="12" r="10" />
				<line x1="12" y1="16" x2="12" y2="12" />
				<line x1="12" y1="8" x2="12.01" y2="8" />
			</svg>
			<h2 class="text-xl font-semibold mb-2">No IOCs Found</h2>
			<p class="text-muted-foreground mb-4">
				There are no Indicators of Compromise associated with this case yet.
			</p>
			<Button href={`/case/${caseId}/iocs/new`} variant="default">
				<PlusCircleIcon class="mr-2 h-4 w-4" />
				Add First IOC
			</Button>
		</div>
	{/if}
</div>

<style>
	/* Ensure the grid takes available space and scrolls */
	.grid {
		flex-grow: 1;
	}
</style>

<script lang="ts">
	// Placeholder for Linked Items tab content
	import type { Ioc } from '$lib/types/resources/ioc';

	let { ioc }: { ioc: Ioc | null } = $props();
</script>

<div class="p-4">
	<h3 class="text-lg font-semibold mb-2">Linked Items</h3>
	{#if ioc && ioc.link && ioc.link.length > 0}
		<pre
			class="bg-muted/50 p-3 rounded-md text-xs overflow-x-auto"
		><code>{JSON.stringify(ioc.link, null, 2)}</code></pre>
	{:else}
		<p class="text-muted-foreground">No items linked to this IOC.</p>
	{/if}
</div>

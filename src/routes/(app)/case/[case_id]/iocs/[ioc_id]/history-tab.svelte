<script lang="ts">
	// Placeholder for History tab content
	import type { Ioc } from '$lib/types/resources/ioc';

	let { ioc }: { ioc: Ioc | null } = $props();
</script>

<div class="p-4">
	<h3 class="text-lg font-semibold mb-2">IOC History</h3>
	{#if ioc && ioc.modification_history && Object.keys(ioc.modification_history).length > 0}
		<pre
			class="bg-muted/50 p-3 rounded-md text-xs overflow-x-auto"
		><code>{JSON.stringify(ioc.modification_history, null, 2)}</code></pre>
	{:else}
		<p class="text-muted-foreground">No modification history available for this IOC.</p>
	{/if}
</div>

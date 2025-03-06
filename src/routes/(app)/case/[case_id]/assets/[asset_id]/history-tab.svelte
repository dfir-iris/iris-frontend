<script lang="ts">
	import type { Asset } from '$lib/types/resources/asset';
	import { HistoryIcon, CircleIcon } from 'lucide-svelte';

	let { asset }: { asset: Asset } = $props();
	
	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleString();
	}
	
	// This is a placeholder. In a real scenario, you'd have actual history data.
	const historyEvents = [
		{ date: asset.date_added, event: 'Asset Created' },
		{ date: asset.date_update, event: 'Last Updated' },
		// Add more events as needed
	];
</script>


<div class="space-y-8 p-1">
  <section>
    <div class="flex items-center gap-2 mb-4 border-b pb-2">
      <HistoryIcon class="h-5 w-5 text-primary" />
      <h2 class="text-lg font-semibold">Modification History</h2>
    </div>
    
    <div class="relative pl-4 border-l-2 border-border">
      {#each asset.modification_history as event, index}
        <div class="mb-8 relative">
          <CircleIcon class="absolute -left-[25px] top-8 h-4 w-4 text-primary bg-background" />
          <div class="bg-card/40 p-4 rounded-lg border border-border/50">
            <p class="text-sm font-medium text-muted-foreground">{formatDate(event.date)}</p>
            <p class="font-semibold text-foreground">{event.event}</p>
          </div>
        </div>
      {/each}
    </div>
    
    {#if !asset.modification_history}
      <p class="text-muted-foreground italic">No modification history available</p>
    {/if}
  </section>
</div>

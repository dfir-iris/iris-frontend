<script lang="ts">
	import type { Asset } from '$lib/types/resources/asset';
	import ActivityHistory from '$lib/components/common/ActivityHistory.svelte';

	let { asset }: { asset: Asset } = $props();
</script>

<ActivityHistory 
	modificationHistory={asset.modification_history}
	entityType="asset"
	title="Activity History"
	emptyStateTitle="No activity yet"
	emptyStateDescription="When changes are made to this asset, they'll be recorded here in the activity history."
/>
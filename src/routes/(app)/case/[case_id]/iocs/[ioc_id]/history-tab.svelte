<script lang="ts">
	import type { Ioc } from '$lib/types/resources/ioc';
	import ActivityHistory from '$lib/components/common/ActivityHistory.svelte';

	let { ioc }: { ioc: Ioc } = $props();
</script>

<ActivityHistory
	modificationHistory={ioc.modification_history}
	entityType="ioc"
	title="Activity History"
	emptyStateTitle="No activity yet"
	emptyStateDescription="When changes are made to this IOC, they'll be recorded here in the activity history."
/>

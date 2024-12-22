<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import SeverityBadge from '$lib/components/ui/badge/severity-badge.svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import { TagIcon } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	$inspect(data);
</script>

<!-- Overview info -->
<div class="flex w-full flex-col border-b bg-muted/20 p-4">
	{#await data.case}
		loader
	{:then { data: caseData }}
		<p>Customer #{caseData.case_customer}</p>
		<h1>{caseData.case_name}</h1>
		<div class="flex flex-row gap-x-2 py-2">
			<StatusBadge status="In progress"></StatusBadge>
			<SeverityBadge severity="High"></SeverityBadge>
			<Badge icon={TagIcon}>tag1</Badge>
			<Badge icon={TagIcon}>tag2</Badge>
			<Badge icon={TagIcon}>tag3</Badge>
		</div>
	{/await}
</div>

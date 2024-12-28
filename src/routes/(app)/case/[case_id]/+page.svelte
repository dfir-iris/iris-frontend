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
	{/await}
</div>

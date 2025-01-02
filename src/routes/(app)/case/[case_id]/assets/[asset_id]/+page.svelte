<script lang="ts">
	import { Tabs, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<h1 class="mb-4">pc2</h1>
<Tabs>
	<TabsList class="border">
		<TabsTrigger value="details">Details</TabsTrigger>
		<TabsTrigger value="graph">Graph</TabsTrigger>
	</TabsList>
</Tabs>

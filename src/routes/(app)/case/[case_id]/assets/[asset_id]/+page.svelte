<script lang="ts">
	import ErrorAlert from '$lib/components/ui/alert/ErrorAlert.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { ComputerIcon, TagIcon } from 'lucide-svelte';
	import type { PageData } from './$types';
	import DetailsTab from './details-tab.svelte';
	import { Button } from '$lib/components/ui/button';

	let { data }: { data: PageData } = $props();
	$inspect(data);
</script>

{#await data.asset}
	<Skeleton class="mb-4 h-10 w-24"></Skeleton>
{:then getAssetReq}
	{@const assetData = getAssetReq?.data}
	{#if assetData}
		<Card class="h-full">
			<CardContent class="flex flex-col items-start gap-y-4">
				<div class="flex w-full flex-row items-center gap-x-2">
					<ComputerIcon class="h-8 w-8"></ComputerIcon>
					<h1>{assetData.asset_name}</h1>
					<div class="w-full"></div>
					<Button variant="default">Edit</Button>
				</div>
				{#each assetData.asset_tags as tag}
					<Badge icon={TagIcon}>{tag}</Badge>
				{/each}
				<Tabs>
					<TabsList class="border">
						<TabsTrigger value="details">Details</TabsTrigger>
						<TabsTrigger value="alerts">Alerts</TabsTrigger>
						<TabsTrigger value="graph">Graph</TabsTrigger>
						<TabsTrigger value="iocs">IOCs</TabsTrigger>
						<TabsTrigger value="history">History</TabsTrigger>
					</TabsList>
					<DetailsTab asset={assetData} />
				</Tabs>
			</CardContent>
		</Card>
	{:else}
		<ErrorAlert>There was a problem loading asset #{data.assetId}!</ErrorAlert>
	{/if}
{/await}

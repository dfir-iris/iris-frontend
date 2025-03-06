<script lang="ts">
	import ErrorAlert from '$lib/components/ui/alert/ErrorAlert.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { 
		ComputerIcon, 
		TagIcon, 
		AlertTriangleIcon, 
		NetworkIcon, 
		HistoryIcon, 
		ShieldAlertIcon,
		EditIcon,
		Trash2Icon,
		InfoIcon
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import DetailsTab from './details-tab.svelte';
	import HistoryTab from './history-tab.svelte';
	import { fade, fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	let { data }: { data: PageData } = $props();
	$inspect(data);
	
	let activeTab = $state('details');
</script>

<div class="py-6">
	{#await data.asset}
		<div class="space-y-4" transition:fade={{ duration: 200 }}>
			<Skeleton class="h-12 w-48 rounded-lg"></Skeleton>
			<Card>
				<CardContent class="p-8">
					<div class="flex items-center gap-4 mb-6">
						<Skeleton class="h-10 w-10 rounded-full"></Skeleton>
						<Skeleton class="h-8 w-64"></Skeleton>
					</div>
					<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
						{#each Array(6) as _}
							<div class="space-y-2">
								<Skeleton class="h-4 w-24"></Skeleton>
								<Skeleton class="h-6 w-full"></Skeleton>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		</div>
	{:then getAssetReq}
		{@const assetData = getAssetReq?.data}
		{#if assetData}
			<div>
				<Card class="border-0 shadow-lg overflow-hidden mb-6">
					<div class="bg-gradient-to-r from-primary/10 to-primary/5 p-6">
						<div class="flex flex-col md:flex-row items-start md:items-center gap-4">
							<div class="bg-primary/10 p-3 rounded-lg text-primary">
								<ComputerIcon class="h-8 w-8" />
							</div>
							<div class="flex-grow">
								<h1 class="text-2xl font-bold">{assetData.asset_name}</h1>
								<p class="text-muted-foreground">{assetData.asset_type?.asset_name || 'Unknown Type'}</p>
								<p class="text-muted-foreground text-xs">#{assetData.asset_id || 'Unknown ID'} - #{assetData.asset_uuid || 'Unknown ID'}</p>
							</div>
							<div class="flex gap-2 mt-4 md:mt-0 w-full md:w-auto">
								<Button variant="outline" size="sm" class="flex items-center gap-1">
									<EditIcon class="h-4 w-4" />
									<span>Edit</span>
								</Button>
								<Button variant="destructive" size="sm" class="flex items-center gap-1">
									<Trash2Icon class="h-4 w-4" />
									<span>Delete</span>
								</Button>
							</div>
						</div>
					</div>
				</Card>

				<Card class="border shadow-md">
					<CardContent class="p-0">
						<Tabs bind:value={activeTab} class="w-full">
							<div class="border-b">
								<TabsList class="p-0 h-auto bg-transparent border-0 w-full rounded-none">
									<TabsTrigger 
										value="details" 
										class="flex items-center gap-2 py-4 px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
									>
										<InfoIcon class="h-4 w-4" />
										<span>Details</span>
									</TabsTrigger>
									<TabsTrigger 
										value="alerts" 
										class="flex items-center gap-2 py-4 px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
									>
										<AlertTriangleIcon class="h-4 w-4" />
										<span>Alerts</span>
									</TabsTrigger>
									<TabsTrigger 
										value="graph" 
										class="flex items-center gap-2 py-4 px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
									>
										<NetworkIcon class="h-4 w-4" />
										<span>Graph</span>
									</TabsTrigger>
									<TabsTrigger 
										value="iocs" 
										class="flex items-center gap-2 py-4 px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
									>
										<ShieldAlertIcon class="h-4 w-4" />
										<span>IOCs</span>
									</TabsTrigger>
									<TabsTrigger 
										value="history" 
										class="flex items-center gap-2 py-4 px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none"
									>
										<HistoryIcon class="h-4 w-4" />
										<span>History</span>
									</TabsTrigger>
								</TabsList>
							</div>
							
							<div class="p-6">
								<TabsContent value="details">
									<DetailsTab asset={assetData}/>
								</TabsContent>
								<TabsContent value="history">
									<HistoryTab asset={assetData} />
								</TabsContent>
							</div>
						</Tabs>
					</CardContent>
				</Card>
			</div>
		{:else}
			<div in:fade>
				<ErrorAlert>
					<div class="flex items-center gap-2">
						<AlertTriangleIcon class="h-5 w-5" />
						<span>There was a problem loading asset #{data.assetId}!</span>
					</div>
				</ErrorAlert>
			</div>
		{/if}
	{/await}
</div>
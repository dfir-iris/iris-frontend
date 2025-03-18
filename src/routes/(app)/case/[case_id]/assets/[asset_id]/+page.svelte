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
		InfoIcon,
		SaveIcon,
		XIcon
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import DetailsTab from './details-tab.svelte';
	import HistoryTab from './history-tab.svelte';
	import { fade, fly } from 'svelte/transition';
	import { Toaster } from '$lib/components/ui/toast';
	import { AssetService } from '$lib/services/asset.service';
	import { toast } from '$lib/components/ui/toast';
	import { Input } from '$lib/components/ui/input';
	import type { Asset } from '$lib/types/resources/asset';
	import { goto } from '$app/navigation';

	let { data } = $props<{ data: PageData }>();
	$inspect(data);

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleString();
	}
	
	let activeTab = $state('details');
	let isEditing = $state(false);
	let isSaving = $state(false);
	
	let editData = $state({
		asset_name: '',
		asset_description: '',
		asset_ip: '',
		asset_domain: ''
	});
	
	// This state will be used to update the UI directly
	let displayAssetData = $state<Asset | null>(null);

	// When data.asset resolves, store the result
	$effect(() => {
		(async () => {
			try {
				const assetResponse = await data.asset;
				displayAssetData = assetResponse?.data;
			} catch (error) {
				console.error('Error resolving asset data:', error);
			}
		})();
	});
	
	function handleUpdateEditData(field: string, value: string | number) {
		editData[field] = value;
	}
	
	function startEditing() {
		console.log('Start editing called');
		if (!displayAssetData) {
			console.error('Asset data not available');
			return;
		}
		
		// Initialize edit data with current values
		editData = {
			asset_name: displayAssetData.asset_name,
			asset_description: displayAssetData.asset_description || '',
			asset_ip: displayAssetData.asset_ip || '',
			asset_domain: displayAssetData.asset_domain || ''
		};
		
		isEditing = true;
		console.log('Editing mode enabled', editData);
	}
	
	function cancelEditing() {
		isEditing = false;
	}
	
	async function saveChanges() {
		if (!displayAssetData) return;
		
		isSaving = true;
		
		try {
			const response = await AssetService.updateAsset(
				data.caseId, 
				displayAssetData.asset_id.toString(), 
				editData
			);
			
			// Update both the display asset data and the data in the awaited promise result
			// This will update all UI elements that use either data source
			displayAssetData = { 
				...displayAssetData, 
				...editData,
				date_update: new Date().toISOString() // Update the last modified date
			};
			
			// Force a refresh of the page data to ensure all components see the updated data
			// We do this by refreshing the current page
			if (response?.data) {
				// If we got back data from the API, use that to ensure complete consistency
				displayAssetData = {
					...displayAssetData,
					...response.data
				};
			}
			
			// Update the resolved asset data in the promise result
			if (data.asset.then) {
				const originalAssetResponse = await data.asset;
				if (originalAssetResponse && originalAssetResponse.data) {
					originalAssetResponse.data = {
						...originalAssetResponse.data,
						...editData,
						date_update: new Date().toISOString()
					};
				}
			}
			
			toast({
				title: "Asset updated",
				description: "Asset details have been successfully updated.",
				variant: "success"
			});
			
			isEditing = false;
		} catch (error) {
			console.error('Error updating asset:', error);
			toast({
				title: "Update failed",
				description: "There was a problem updating the asset details.",
				variant: "destructive"
			});
		} finally {
			isSaving = false;
		}
	}
	
</script>

<div class="py-2">
	{#await data.asset}
		<div class="space-y-4">
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
		{@const assetData = displayAssetData || getAssetReq?.data}
		{#if assetData}
			<div>
				<Card class="border-0 shadow-lg overflow-hidden mb-5">
					<div class="p-4">
						<div class="flex flex-col md:flex-row items-start md:items-center gap-4">
							<div class="bg-primary/10 p-3 rounded-lg text-primary">
								<ComputerIcon class="h-8 w-8" />
							</div>
							<div class="flex-grow">
									<h2 class="text-2xl font-bold">{assetData.asset_name}</h2>
									<p class="text-muted-foreground">{assetData.asset_type?.asset_name || 'Unknown Type'}</p>
							</div>
							<div class="flex gap-2 mt-4 md:mt-0 w-full md:w-auto">
								{#if isEditing}
									<Button 
										variant="outline" 
										size="sm" 
										onclick={cancelEditing}
										class="flex items-center gap-1" 
										disabled={isSaving}
									>
										<XIcon class="h-4 w-4" />
										<span>Cancel</span>
									</Button>
									<Button 
										variant="default" 
										size="sm" 
										onclick={saveChanges}
										class="flex items-center gap-1" 
										disabled={isSaving}
									>
										{#if isSaving}
											<span class="animate-spin">⟳</span>
											<span>Saving...</span>
										{:else}
											<SaveIcon class="h-4 w-4" />
											<span>Save</span>
										{/if}
									</Button>
								{:else}
									<Button 
										variant="outline" 
										size="sm" 
										onclick={startEditing}
										class="flex items-center gap-1"
									>
										<EditIcon class="h-4 w-4" />
										<span>Edit</span>
									</Button>
									<Button variant="destructive" size="sm" class="flex items-center gap-1">
										<Trash2Icon class="h-4 w-4" />
										<span>Delete</span>
									</Button>
								{/if}
							</div>
						</div>
					</div>
				</Card>

				<Card class="border shadow-md overflow-hidden">
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
									<DetailsTab 
										asset={assetData}
										isEditing={isEditing}
										editData={editData}
										onUpdateEditData={handleUpdateEditData}
									/>
								</TabsContent>
								<TabsContent value="history">
									<HistoryTab asset={assetData} />
								</TabsContent>
							</div>
						</Tabs>
					</CardContent>
				</Card>

				<div class="py-6 px-2">
					<div class="flex flex-col md:flex-row items-start md:items-center gap-4">
						<div class="flex-grow text-xs">
							<p class="text-muted-foreground">Added on {formatDate(assetData.date_added)} - Last updated on {formatDate(assetData.date_update)} - ID #{assetData.asset_id || 'Unknown ID'} - UUID #{assetData.asset_uuid || 'Unknown ID'}</p>
						</div>
					</div>
				</div>
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
	
	<Toaster />
</div>
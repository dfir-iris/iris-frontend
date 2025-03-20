<script lang="ts">
	import ErrorAlert from '$lib/components/ui/alert/ErrorAlert.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { 
		ComputerIcon, 
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
	import { fade } from 'svelte/transition';
	import { AssetService } from '$lib/services/asset.service';
	import { toast } from '$lib/components/ui/toast';
	import type { Asset } from '$lib/types/resources/asset';
	import { assetTypes } from '$lib/stores/asset-types.store';
	import { analysisStatuses } from '$lib/stores/analysis-status.store';
	import { assetsStore } from '$lib/stores/assets.store';
	import ScrollArea from '$lib/components/ui/scroll-area/scroll-area.svelte';
	import type { Tag, TagInput } from '$lib/stores/tags.store';
	import { tagsStore } from '$lib/stores/tags.store';

	let { data } = $props<{ data: PageData }>();
	$inspect(data);

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleString();
	}

	$effect(() => {
		// Fetch the stores data once
		assetTypes.fetch();
		analysisStatuses.fetch();
	});
	
	let activeTab = $state('details');
	let isEditing = $state(false);
	let isSaving = $state(false);
	
	// Keep track of tags separately to ensure they're properly updated
	let currentTags = $state<Tag[]>([]);
	
	let editData = $state<{
		asset_name: string;
		asset_description: string;
		asset_ip: string;
		asset_domain: string;
		asset_type_id: number | undefined;
		analysis_status_id: number | undefined;
		asset_compromise_status_id: number | undefined;
		asset_tags: string;
	}>({
		asset_name: '',
		asset_description: '',
		asset_ip: '',
		asset_domain: '',
		asset_type_id: undefined,
		analysis_status_id: undefined,
		asset_compromise_status_id: undefined,
		asset_tags: ''
	});
	
	// This state will be used to update the UI directly
	let displayAssetData = $state<Asset | null>(null);

	// When data.asset resolves, store the result
	$effect(() => {
		(async () => {
			try {
				const assetResponse = await data.asset;
				displayAssetData = assetResponse?.data;
				
				// Initialize currentTags from asset_tags if it exists
				if (displayAssetData?.asset_tags) {
					currentTags = tagsStore.normalizeTags(displayAssetData.asset_tags);
				}
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
		
		// Initialize currentTags from asset_tags if it exists
		if (displayAssetData.asset_tags) {
			currentTags = tagsStore.normalizeTags(displayAssetData.asset_tags);
		} else {
			currentTags = [];
		}
		
		// Initialize edit data with current values
		editData = {
			asset_name: displayAssetData.asset_name,
			asset_description: displayAssetData.asset_description || '',
			asset_ip: displayAssetData.asset_ip || '',
			asset_domain: displayAssetData.asset_domain || '',
			asset_type_id: displayAssetData.asset_type?.id,
			analysis_status_id: displayAssetData.analysis_status?.id,
			asset_compromise_status_id: displayAssetData.asset_compromise_status_id || 3,
			asset_tags: displayAssetData.asset_tags || '' 
		};
		
		isEditing = true;
		console.log('Editing mode enabled', editData);
		console.log('Current tags:', currentTags);
	}
	
	function cancelEditing() {
		isEditing = false;
	}
	
	async function saveChanges() {
		if (!displayAssetData) return;
		
		isSaving = true;
		
		try {
			const assetId = displayAssetData.asset_id.toString();
						
			// Create a complete updated asset object
			const updatedAssetData = {
				...displayAssetData,  // Start with all existing data
				...editData,          // Apply our edits
				date_update: new Date().toISOString()
			};
			
			// If we're updating the asset type or analysis status, make sure the objects are preserved
			if (editData.asset_type_id && displayAssetData.asset_type) {
				const assetType = $assetTypes.find(t => t.id === editData.asset_type_id);
				if (assetType) {
					updatedAssetData.asset_type = assetType;
				}
			}
			
			if (editData.analysis_status_id && displayAssetData.analysis_status) {
				const analysisStatus = $analysisStatuses.find(s => s.id === editData.analysis_status_id);
				if (analysisStatus) {
					updatedAssetData.analysis_status = analysisStatus;
				}
			}
			
			// Ensure tags are properly set in the updated asset data
			updatedAssetData.asset_tags = editData.asset_tags;
			
			// Create a payload with only the fields we want to update
			const updatePayload = {
				asset_name: editData.asset_name,
				asset_description: editData.asset_description,
				asset_ip: editData.asset_ip,
				asset_domain: editData.asset_domain,
				asset_type_id: editData.asset_type_id,
				analysis_status_id: editData.analysis_status_id,
				asset_compromise_status_id: editData.asset_compromise_status_id,
				asset_tags: editData.asset_tags
			};
			
			console.log('Sending update payload:', updatePayload);
			
			// Send the update to the API
			const response = await AssetService.updateAsset(
				data.caseId, 
				assetId, 
				updatePayload
			);
			
			// If we got a response, use it to update our data
			if (response?.data) {
				// Merge the response data with our updated data to ensure we have everything
				Object.assign(updatedAssetData, response.data);
			}
			
			// Update the local display data
			displayAssetData = updatedAssetData;
			
			// Update the asset in the store with the complete asset object
			console.log('Updating asset in store from page:', assetId, updatedAssetData);
			assetsStore.updateAsset(assetId, updatedAssetData);
			
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

<div class="">
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
					<Card class="border-0 shadow-lg overflow-hidden">
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
					<ScrollArea class="h-[calc(100vh-220px)] mt-5">
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
			</ScrollArea>
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
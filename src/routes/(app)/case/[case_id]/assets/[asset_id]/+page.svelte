<script lang="ts">
	import ErrorAlert from '$lib/components/ui/alert/ErrorAlert.svelte';
	import { Card, CardContent } from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { Tabs, TabsContent, TabsList, TabsTrigger } from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { 
		ComputerIcon, 
		AlertTriangleIcon, 
		HistoryIcon, 
		ShieldAlertIcon,
		EditIcon,
		Trash2Icon,
		InfoIcon,
		SaveIcon,
		XIcon,
		SearchIcon, // Added for "not found" message

		CalendarRange

	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import DetailsTab from './details-tab.svelte';
	import HistoryTab from './history-tab.svelte';
	import IOCsTab from './ioc-tab.svelte';
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
	import DeleteButton from '$lib/components/common/DeleteButton.svelte'; // Import DeleteButton
	import { goto } from '$app/navigation'; // Import goto for navigation
	import { ENDPOINTS } from '$lib/constants/endpoints'; // Import ENDPOINTS

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
	let isLoading = $state(false);
	let hasError = $state(false);
	let shouldShowLoading = $state(false);
	
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
				// Set loading state
				isLoading = true;
				
				// Start a timer to show loading state only if it takes longer than 150ms
				const loadingTimer = setTimeout(() => {
					if (isLoading) {
						shouldShowLoading = true;
					}
				}, 150);
				
				// Fetch the asset data
				const assetResponse = await data.asset;
				displayAssetData = assetResponse?.data;
				
				// Initialize currentTags from asset_tags if it exists
				if (displayAssetData?.asset_tags) {
					currentTags = tagsStore.normalizeTags(displayAssetData.asset_tags);
				}
				
				hasError = false;
				
				// Clear the timer if it hasn't fired yet
				clearTimeout(loadingTimer);
			} catch (error) {
				console.error('Error resolving asset data:', error);
				hasError = true;
			} finally {
				// Set loading to false
				isLoading = false;
				// If we've already shown the loading state, add a small delay before hiding it
				if (shouldShowLoading) {
					setTimeout(() => {
						shouldShowLoading = false;
					}, 50);
				} else {
					shouldShowLoading = false;
				}
			}
		})();
	});
	
	// Add a function to handle asset changes from the details tab
	function handleAssetChange(updatedAsset: Partial<Asset>) {
		if (!displayAssetData) return;
		
		// Create a new asset object with the updated fields
		displayAssetData = { 
			...displayAssetData, 
			...updatedAsset
		};
		
		// If we have the asset ID, also update the store
		if (displayAssetData.asset_id) {
			const assetId = displayAssetData.asset_id.toString();
			assetsStore.updateAsset(assetId, displayAssetData);
		}
	}
	
	function handleUpdateEditData(field: string, value: string | number | Tag[]) {
		console.log(`Updating ${field} with:`, value);
		
		// Handle tags specifically
		if (field === 'asset_tags') {
			if (Array.isArray(value)) {
				// Store the Tag objects for later use
				currentTags = [...value];
				// Convert tag array to string format for the API
				editData.asset_tags = value.map(tag => tag.tag_title).join(',');
				console.log('Updated tags array:', currentTags);
				console.log('Updated asset_tags string:', editData.asset_tags);
			} else if (typeof value === 'string') {
				// If we received a string, normalize it to tags and then back to a string
				currentTags = tagsStore.stringToTags(value);
				editData.asset_tags = value;
				console.log('Updated tags from string:', currentTags);
			}
		} else {
			// Handle other fields normally
			editData[field] = value;
		}
	}
	
	function startEditing() {
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
	}
	
	function cancelEditing() {
		isEditing = false;
		// Reset currentTags to match the original asset
		if (displayAssetData?.asset_tags) {
			currentTags = tagsStore.normalizeTags(displayAssetData.asset_tags);
		} else {
			currentTags = [];
		}
	}
	
	async function saveChanges() {
		if (!displayAssetData) return;
		
		isSaving = true;
		
		try {
			const assetId = displayAssetData.asset_id.toString();
			
			// Ensure asset_tags is up to date with currentTags
			if (currentTags.length > 0) {
				editData.asset_tags = currentTags.map(tag => tag.tag_title).join(',');
			}
			
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
			updatedAssetData.tags = currentTags;
			
			// Create a payload with only the fields we want to update
			const updatePayload = {
				asset_name: editData.asset_name,
				asset_description: editData.asset_description,
				asset_ip: editData.asset_ip,
				asset_domain: editData.asset_domain,
				asset_type_id: editData.asset_type_id,
				analysis_status_id: editData.analysis_status_id,
				asset_compromise_status_id: editData.asset_compromise_status_id,
				asset_tags: editData.asset_tags  // Send the comma-separated string
			};
						
			// Send the update to the API
			const response = await AssetService.updateAsset(
				data.caseId, 
				assetId, 
				updatePayload  // Send our explicit payload
			);

			if (!response.ok) {
				throw new Error(response.data?.message || `Unknown error. ${response.status}`);
			}
			
			// If we got a response, use it to update our data
			if (response?.data) {
				// Merge the response data with our updated data to ensure we have everything
				Object.assign(updatedAssetData, response.data);
				
				// Make sure tags are preserved even if the API response doesn't include them
				if (!response.data.asset_tags && editData.asset_tags) {
					updatedAssetData.asset_tags = editData.asset_tags;
				}
				if (!response.data.tags && currentTags.length > 0) {
					updatedAssetData.tags = currentTags;
				}
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
				description: `There was a problem updating the asset details.${error.message ? ` Error: ${error.message}` : ''}`,
				variant: "destructive"
			});
		} finally {
			isSaving = false;
		}
	}

	function handleAssetDeleted() {
		const assetName = displayAssetData?.asset_name || 'Unknown';
		const assetId = displayAssetData!.asset_id.toString();
		
		assetsStore.removeAsset(assetId); // Remove from local store for immediate UI update if any part of this page relies on it
		
		// Navigate first
		goto(`/case/${data.caseId}/assets`, { replaceState: true }).then(() => {
			// Then trigger a list refresh via the store
			assetsStore.triggerListRefresh();
		});
	}
	
</script>

<div class="">
	{#if shouldShowLoading}
		<div class="space-y-4">
			<Card class="border-0 shadow-lg overflow-hidden">
				<Skeleton class="h-12 w-48 rounded-lg"></Skeleton>
			</Card>
			<Card>
				<CardContent class="p-8">
					<div class="flex items-center gap-4 mb-6">
						<Skeleton class="h-10 w-10 rounded-full"></Skeleton>
						<Skeleton class="h-8 w-64"></Skeleton>
					</div>
					<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
						{#each Array(12) as _}
							<div class="space-y-2">
								<Skeleton class="h-4 w-24"></Skeleton>
								<Skeleton class="h-6 w-full"></Skeleton>
							</div>
						{/each}
					</div>
				</CardContent>
			</Card>
		</div>
	{:else if hasError}
		<div in:fade>
			<ErrorAlert>
				<div class="flex items-center gap-2">
					<AlertTriangleIcon class="h-5 w-5" />
					<span>There was a problem loading asset #{data.assetId}!</span>
				</div>
			</ErrorAlert>
		</div>
	{:else if displayAssetData?.asset_id}
		<div in:fade={{ duration: 150 }}>
			<Card class="border-0 shadow-lg overflow-hidden">
				<div class="p-4">
					<div class="flex flex-col md:flex-row items-start md:items-center gap-4">
						<div class="bg-primary/10 p-3 rounded-lg text-primary">
							<ComputerIcon class="h-8 w-8" />
						</div>
						<div class="flex-grow">
								<h2 class="text-2xl font-bold">{displayAssetData.asset_name}</h2>
								<p class="text-muted-foreground">{displayAssetData.asset_type?.asset_name || 'Unknown Type'}</p>
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
								<DeleteButton
									url={ENDPOINTS.case.assets.delete(data.caseId, displayAssetData.asset_id.toString())}
									onrefresh={handleAssetDeleted}
									buttonText="Delete"
									deletion_prompt_message={`Are you sure you want to delete the asset "${displayAssetData.asset_name}"? This action cannot be undone.`}
								/>
							{/if}
						</div>
					</div>
				</div>
			</Card>
			<ScrollArea class="h-[calc(100vh-220px)] mt-5 rounded-lg">
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
										<CalendarRange class="h-4 w-4" />
										<span>Timeline</span>
									</TabsTrigger>
									<TabsTrigger 
										value="ioc" 
										class="flex items-center gap-2 py-4 px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none relative"
									>
										<ShieldAlertIcon class="h-4 w-4" />
										<span>IOCs</span>
										{#if displayAssetData?.iocs?.length}
											<span class="ml-1.5 inline-flex items-center justify-center h-4 min-w-4 text-[10px] font-medium leading-none data-[state=active]:bg-primary/20 data-[state=active]:text-primary bg-muted text-muted-foreground rounded-sm px-1 transition-colors">
												{displayAssetData.iocs.length}
											</span>
										{/if}
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
										asset={displayAssetData}
										isEditing={isEditing}
										editData={editData}
										onUpdateEditData={handleUpdateEditData}
										currentTags={currentTags}
										onAssetChange={handleAssetChange}
									/>
								</TabsContent>
								<TabsContent value="ioc">
									<IOCsTab bind:asset={displayAssetData} />
								</TabsContent>
								<TabsContent value="history">
									<HistoryTab asset={displayAssetData} />
								</TabsContent>

							</div>
						</Tabs>
					</CardContent>
				</Card>
				<div class="py-6 px-2">
					<div class="flex flex-col md:flex-row items-start md:items-center gap-4">
						<div class="flex-grow text-xs">
							<p class="text-muted-foreground">Added on {formatDate(displayAssetData.date_added)} - Last updated on {formatDate(displayAssetData.date_update)} - ID #{displayAssetData.asset_id || 'Unknown ID'} - UUID #{displayAssetData.asset_uuid || 'Unknown ID'}</p>
						</div>
					</div>
				</div>
			</ScrollArea>
		</div>
	{:else if isLoading && !shouldShowLoading}
		<!-- Invisible placeholder while loading but not showing loading UI -->
		<div class="invisible">
			<Card class="border-0 shadow-lg overflow-hidden">
				<div class="p-4 h-[68px]"></div>
			</Card>
		</div>
	{:else if !isLoading && !displayAssetData?.asset_id}
		<!-- Asset not found or not loaded -->
		<div in:fade class="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center">
			<SearchIcon class="h-16 w-16 text-muted-foreground/50 mb-4" />
			<h2 class="text-xl font-semibold text-muted-foreground mb-2">Asset Not Found</h2>
			<p class="text-muted-foreground">
				The asset with ID #{data.assetId} could not be found or loaded.
			</p>
			<p class="text-muted-foreground mt-1">
				Please select an asset from the list on the left, or try refreshing the page.
			</p>
			<Button variant="outline" class="mt-6" onclick={() => goto(`/case/${data.caseId}/assets`, { replaceState: true })}>
				Go to Assets List
			</Button>
		</div>
	{/if}
</div>
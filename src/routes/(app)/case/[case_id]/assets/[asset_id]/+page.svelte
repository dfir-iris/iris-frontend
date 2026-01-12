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
			// Handle other fields normally with proper type checking
			(editData as any)[field] = value;
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
			asset_type_id: displayAssetData.asset_type?.asset_id,
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
			
			// Create a payload with only the fields we want to update
			const updatePayload = {
				asset_name: editData.asset_name,
				asset_description: editData.asset_description,
				asset_ip: editData.asset_ip,
				asset_domain: editData.asset_domain,
				asset_type_id: editData.asset_type_id,
				analysis_status_id: editData.analysis_status_id,
				asset_compromise_status_id: editData.asset_compromise_status_id || 3,
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
			
			// Create a complete updated asset object
			const updatedAssetData: Asset = {
				...displayAssetData,  // Start with all existing data
				...updatePayload,     // Apply our edits
				date_update: new Date().toISOString(),
				asset_compromise_status_id: editData.asset_compromise_status_id || 3,
				asset_type_id: editData.asset_type_id || displayAssetData.asset_type_id,
				analysis_status_id: editData.analysis_status_id || displayAssetData.analysis_status_id
			};
			
			// If we got a response, merge it with our updated data
			if (response?.data) {
				Object.assign(updatedAssetData, response.data);
			}
			
			// If we're updating the asset type, make sure the objects are preserved
			if (editData.asset_type_id && displayAssetData.asset_type) {
				// Since the store AssetType interface might not match the API data structure,
				// we need to find the asset type from the API data structure
				const assetType = $assetTypes.find(t => (t as any).asset_id === editData.asset_type_id);
				if (assetType) {
					updatedAssetData.asset_type = {
						asset_name: assetType.asset_name,
						asset_description: assetType.asset_description,
						asset_icon_compromised: (assetType as any).asset_icon_compromised || '',
						asset_icon_not_compromised: (assetType as any).asset_icon_not_compromised || '',
						asset_id: (assetType as any).asset_id || (assetType as any).id
					};
				}
			}
			
			if (editData.analysis_status_id && displayAssetData.analysis_status) {
				const analysisStatus = $analysisStatuses.find(s => s.id === editData.analysis_status_id);
				if (analysisStatus) {
					updatedAssetData.analysis_status = analysisStatus;
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
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			toast({
				title: "Update failed",
				description: `There was a problem updating the asset details.${errorMessage ? ` Error: ${errorMessage}` : ''}`,
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
		<Card class="border shadow-lg overflow-hidden">
			<!-- Header Section Skeleton -->
			<div class="bg-gradient-to-r from-background to-muted/30 border-b">
				<div class="p-6">
					<div class="flex flex-col lg:flex-row items-start lg:items-center gap-4">
						<div class="flex items-center gap-4 flex-1">
							<Skeleton class="h-14 w-14 rounded-xl"></Skeleton>
							<div class="flex-grow min-w-0 space-y-2">
								<Skeleton class="h-8 w-64"></Skeleton>
								<Skeleton class="h-5 w-40"></Skeleton>
							</div>
						</div>
						<div class="flex gap-2">
							<Skeleton class="h-8 w-24"></Skeleton>
							<Skeleton class="h-8 w-20"></Skeleton>
						</div>
					</div>
				</div>
			</div>
			
			<!-- Tabs Skeleton -->
			<div class="border-b bg-muted/20 p-0">
				<div class="flex">
					{#each Array(5) as _}
						<Skeleton class="h-12 w-24 m-2 rounded-none"></Skeleton>
					{/each}
				</div>
			</div>
			
			<!-- Content Skeleton -->
			<div class="p-6">
				<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
					{#each Array(9) as _}
						<div class="space-y-2">
							<Skeleton class="h-4 w-24"></Skeleton>
							<Skeleton class="h-6 w-full"></Skeleton>
						</div>
					{/each}
				</div>
			</div>
			
			<!-- Footer Skeleton -->
			<div class="bg-muted/30 border-t px-6 py-4">
				<div class="flex gap-4">
					<Skeleton class="h-3 w-32"></Skeleton>
					<Skeleton class="h-3 w-32"></Skeleton>
					<Skeleton class="h-3 w-20"></Skeleton>
				</div>
			</div>
		</Card>
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
			<div class="overflow-hidden">
				<!-- Tabs Content -->
				<!-- Use theme-aware background so it's light in the light theme -->
				<CardContent class="p-0 bg-background">
					<!-- Action buttons are now rendered inside the Details tab (General Information) -->

					<Tabs bind:value={activeTab} class="w-full">
						<div class="border-b bg-muted/20">
							<TabsList class="p-0 h-auto bg-transparent border-0 w-full rounded-none">
								<TabsTrigger 
									value="details" 
									class="flex items-center gap-2 py-4 px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80 rounded-none hover:bg-muted/40 transition-colors"
								>
									<InfoIcon class="h-4 w-4" />
									<span>Details</span>
								</TabsTrigger>
								<TabsTrigger 
									value="alerts" 
									class="flex items-center gap-2 py-4 px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80 rounded-none hover:bg-muted/40 transition-colors"
								>
									<AlertTriangleIcon class="h-4 w-4" />
									<span>Alerts</span>
								</TabsTrigger>
								<TabsTrigger 
									value="graph" 
									class="flex items-center gap-2 py-4 px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80 rounded-none hover:bg-muted/40 transition-colors"
								>
									<CalendarRange class="h-4 w-4" />
									<span>Timeline</span>
								</TabsTrigger>
								<TabsTrigger 
									value="ioc" 
									class="flex items-center gap-2 py-4 px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80 rounded-none hover:bg-muted/40 transition-colors relative"
								>
									<ShieldAlertIcon class="h-4 w-4" />
									<span>IOCs</span>
									{#if displayAssetData?.iocs?.length}
										<span class="ml-1.5 inline-flex items-center justify-center h-5 min-w-5 text-[10px] font-medium leading-none data-[state=active]:bg-primary/20 data-[state=active]:text-primary bg-muted text-muted-foreground rounded-full px-1.5 transition-colors">
											{displayAssetData.iocs.length}
										</span>
									{/if}
								</TabsTrigger>
								<TabsTrigger 
									value="history" 
									class="flex items-center gap-2 py-4 px-6 data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-background/80 rounded-none hover:bg-muted/40 transition-colors"
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
									onStartEditing={startEditing}
									onCancelEditing={cancelEditing}
									onSaveChanges={saveChanges}
									onDeleteAsset={handleAssetDeleted}
									isSaving={isSaving}
									deleteUrl={ENDPOINTS.case.assets.delete(data.caseId, displayAssetData.asset_id.toString())}
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
				
				<!-- Footer with metadata -->
				<div class="bg-muted/30 border-t px-6 py-4">
					<div class="flex flex-col sm:flex-row items-start sm:items-center gap-2">
						<div class="flex-grow text-xs text-muted-foreground">
							<div class="flex flex-wrap items-center gap-3">
								<span class="flex items-center gap-1">
									<span class="inline-block w-2 h-2 bg-green-500 rounded-full opacity-60"></span>
									Added {formatDate(displayAssetData.date_added)}
								</span>
								<span class="flex items-center gap-1">
									<span class="inline-block w-2 h-2 bg-blue-500 rounded-full opacity-60"></span>
									Updated {formatDate(displayAssetData.date_update)}
								</span>
								<span class="flex items-center gap-1 font-mono">
									<span class="inline-block w-2 h-2 bg-purple-500 rounded-full opacity-60"></span>
									ID #{displayAssetData.asset_id || 'Unknown'}
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	{:else if isLoading && !shouldShowLoading}
		<!-- Invisible placeholder while loading but not showing loading UI -->
		<div class="invisible">
			<Card class="border shadow-lg overflow-hidden">
				<div class="p-6 h-[100px]"></div>
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
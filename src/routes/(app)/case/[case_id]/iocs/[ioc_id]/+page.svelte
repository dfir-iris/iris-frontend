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
		SearchIcon, 
		CalendarRange
	} from 'lucide-svelte';
	import type { PageData } from './$types';
	import DetailsTab from './details-tab.svelte';
	import HistoryTab from './history-tab.svelte';
	import { fade } from 'svelte/transition';
	import { IocService } from '$lib/services/ioc.service';
	import { toast } from '$lib/components/ui/toast';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { iocTypes } from '$lib/stores/ioc-types.store'
	import { analysisStatuses } from '$lib/stores/analysis-status.store';
	import { iocsStore } from '$lib/stores/iocs.store';
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
		iocTypes.fetch();
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
		ioc_value: string;
		ioc_description: string;
		ioc_ip: string;
		ioc_domain: string;
		ioc_type_id: number | undefined;
		analysis_status_id: number | undefined;
		ioc_compromise_status_id: number | undefined;
		ioc_tags: string;
	}>({
		ioc_value: '',
		ioc_description: '',
		ioc_ip: '',
		ioc_domain: '',
		ioc_type_id: undefined,
		analysis_status_id: undefined,
		ioc_compromise_status_id: undefined,
		ioc_tags: ''
	});
	
	// This state will be used to update the UI directly
	let displayIocData = $state<Ioc | null>(null);

	// When data.ioc resolves, store the result
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
				
				// Fetch the ioc data
				const iocResponse = await data.ioc;
				displayIocData = iocResponse?.data;
				
				// Initialize currentTags from ioc_tags if it exists
				if (displayIocData?.ioc_tags) {
					currentTags = tagsStore.normalizeTags(displayIocData.ioc_tags);
				}
				
				hasError = false;
				
				// Clear the timer if it hasn't fired yet
				clearTimeout(loadingTimer);
			} catch (error) {
				console.error('Error resolving ioc data:', error);
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
	
	// Add a function to handle ioc changes from the details tab
	function handleIocChange(updatedIoc: Partial<Ioc>) {
		if (!displayIocData) return;
		
		// Create a new ioc object with the updated fields
		displayIocData = { 
			...displayIocData, 
			...updatedIoc
		};
		
		// If we have the ioc ID, also update the store
		if (displayIocData.ioc_id) {
			const iocId = displayIocData.ioc_id.toString();
			iocsStore.updateIoc(iocId, displayIocData);
		}
	}
	
	function handleUpdateEditData(field: string, value: string | number | Tag[]) {
		console.log(`Updating ${field} with:`, value);
		
		// Handle tags specifically
		if (field === 'ioc_tags') {
			if (Array.isArray(value)) {
				// Store the Tag objects for later use
				currentTags = [...value];
				// Convert tag array to string format for the API
				editData.ioc_tags = value.map(tag => tag.tag_title).join(',');
				console.log('Updated tags array:', currentTags);
				console.log('Updated ioc_tags string:', editData.ioc_tags);
			} else if (typeof value === 'string') {
				// If we received a string, normalize it to tags and then back to a string
				currentTags = tagsStore.stringToTags(value);
				editData.ioc_tags = value;
				console.log('Updated tags from string:', currentTags);
			}
		} else {
			// Handle other fields normally
			editData[field] = value;
		}
	}
	
	function startEditing() {
		if (!displayIocData) {
			console.error('Ioc data not available');
			return;
		}
		
		// Initialize currentTags from ioc_tags if it exists
		if (displayIocData.ioc_tags) {
			currentTags = tagsStore.normalizeTags(displayIocData.ioc_tags);
		} else {
			currentTags = [];
		}
		
		// Initialize edit data with current values
		editData = {
			ioc_value: displayIocData.ioc_value,
			ioc_description: displayIocData.ioc_description || '',
			ioc_type_id: displayIocData.ioc_type?.type_id,
			ioc_tags: displayIocData.ioc_tags || '' 
		};
		
		isEditing = true;
		console.log('Editing mode enabled', editData);
	}
	
	function cancelEditing() {
		isEditing = false;
		// Reset currentTags to match the original ioc
		if (displayIocData?.ioc_tags) {
			currentTags = tagsStore.normalizeTags(displayIocData.ioc_tags);
		} else {
			currentTags = [];
		}
	}
	
	async function saveChanges() {
		if (!displayIocData) return;
		
		isSaving = true;
		
		try {
			const iocId = displayIocData.ioc_id.toString();
			
			// Ensure ioc_tags is up to date with currentTags
			if (currentTags.length > 0) {
				editData.ioc_tags = currentTags.map(tag => tag.tag_title).join(',');
			}
			
			// Create a complete updated ioc object
			const updatedIocData = {
				...displayIocData,  // Start with all existing data
				...editData,          // Apply our edits
				date_update: new Date().toISOString()
			};
			
			// If we're updating the ioc type, make sure the objects are preserved
			if (editData.ioc_type_id && displayIocData.ioc_type) {
				const iocType = $iocTypes.find(t => t.type_id === editData.ioc_type_id);
				if (iocType) {
					updatedIocData.ioc_type = iocType;
				}
			}
			
			if (editData.analysis_status_id && displayIocData.analysis_status) {
				const analysisStatus = $analysisStatuses.find(s => s.id === editData.analysis_status_id);
				if (analysisStatus) {
					updatedIocData.analysis_status = analysisStatus;
				}
			}
			
			// Ensure tags are properly set in the updated ioc data
			updatedIocData.ioc_tags = editData.ioc_tags;
			updatedIocData.tags = currentTags;
			
			// Create a payload with only the fields we want to update
			const updatePayload = {
				ioc_value: editData.ioc_value,
				ioc_description: editData.ioc_description,
				ioc_type_id: editData.ioc_type_id,
                ioc_tlp_id: editData.ioc_tlp_id,
				ioc_tags: editData.ioc_tags  
			};
						
			// Send the update to the API
			const response = await IocService.updateIoc(
				data.caseId, 
				iocId, 
				updatePayload  // Send our explicit payload
			);

			if (!response.ok) {
				throw new Error(response.data?.message || `Unknown error. ${response.status}`);
			}
			
			// If we got a response, use it to update our data
			if (response?.data) {
				// Merge the response data with our updated data to ensure we have everything
				Object.assign(updatedIocData, response.data);
				
				// Make sure tags are preserved even if the API response doesn't include them
				if (!response.data.ioc_tags && editData.ioc_tags) {
					updatedIocData.ioc_tags = editData.ioc_tags;
				}
				if (!response.data.tags && currentTags.length > 0) {
					updatedIocData.tags = currentTags;
				}
			}
			
			// Update the local display data
			displayIocData = updatedIocData;
			
			// Update the ioc in the store with the complete ioc object
			console.log('Updating ioc in store from page:', iocId, updatedIocData);
			iocsStore.updateIoc(iocId, updatedIocData);
			
			toast({
				title: "Ioc updated",
				description: "Ioc details have been successfully updated.",
				variant: "success"
			});
			
			isEditing = false;
		} catch (error) {
			console.error('Error updating ioc:', error);
			toast({
				title: "Update failed",
				description: `There was a problem updating the ioc details.${error.message ? ` Error: ${error.message}` : ''}`,
				variant: "destructive"
			});
		} finally {
			isSaving = false;
		}
	}

	function handleAssetDeleted() {
		const assetName = displayIocData?.ioc_value || 'Unknown';
		const iocId = displayIocData!.ioc_id.toString();
		
		iocsStore.removeIoc(iocId); // Remove from local store for immediate UI update if any part of this page relies on it
		
		// Navigate first
		goto(ENDPOINTS.case.ioc.list(data.caseId), { replaceState: true }).then(() => {
			// Then trigger a list refresh via the store
			iocsStore.triggerListRefresh();
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
					<span>There was a problem loading ioc #{data.iocId}!</span>
				</div>
			</ErrorAlert>
		</div>
	{:else if displayIocData?.ioc_id}
		<div in:fade={{ duration: 150 }}>
			<Card class="border-0 shadow-lg overflow-hidden">
				<div class="p-4">
					<div class="flex flex-col md:flex-row items-start md:items-center gap-4">
						<div class="bg-primary/10 p-3 rounded-lg text-primary">
							<ComputerIcon class="h-8 w-8" />
						</div>
						<div class="flex-grow">
								<h2 class="text-2xl font-bold">{displayIocData.ioc_value}</h2>
								<p class="text-muted-foreground">{displayIocData.ioc_type?.type_name || 'Unknown Type'}</p>
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
									url={ENDPOINTS.case.ioc.delete(data.caseId, displayIocData.ioc_id.toString())}
									onrefresh={handleAssetDeleted}
									buttonText="Delete"
									deletion_prompt_message={`Are you sure you want to delete the ioc "${displayIocData.ioc_value}"? This action cannot be undone.`}
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
										ioc={displayIocData}
										isEditing={isEditing}
										editData={editData}
										onUpdateEditData={handleUpdateEditData}
										currentTags={currentTags}
										onAssetChange={handleIocChange}
									/>
								</TabsContent>
								<TabsContent value="history">
									<HistoryTab ioc={displayIocData} />
								</TabsContent>
							</div>
						</Tabs>
					</CardContent>
				</Card>
				<div class="py-6 px-2">
					<div class="flex flex-col md:flex-row items-start md:items-center gap-4">
						<div class="flex-grow text-xs">
							<p class="text-muted-foreground">Added on {formatDate(displayIocData.date_added)} - Last updated on {formatDate(displayIocData.date_update)} - ID #{displayIocData.ioc_id || 'Unknown ID'} - UUID #{displayIocData.ioc_uuid || 'Unknown ID'}</p>
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
	{:else if !isLoading && !displayIocData?.ioc_id}
		<!-- Ioc not found or not loaded -->
		<div in:fade class="flex flex-col items-center justify-center h-[calc(100vh-200px)] text-center">
			<SearchIcon class="h-16 w-16 text-muted-foreground/50 mb-4" />
			<h2 class="text-xl font-semibold text-muted-foreground mb-2">Ioc Not Found</h2>
			<p class="text-muted-foreground">
				The ioc with ID #{data.ioc_id} could not be found or loaded.
			</p>
			<p class="text-muted-foreground mt-1">
				Please select an ioc from the list on the left, or try refreshing the page.
			</p>
			<Button variant="outline" class="mt-6" onclick={() => goto(ENDPOINTS.case.ioc.list(data.caseId), { replaceState: true })}>
				Go to Assets List
			</Button>
		</div>
	{/if}
</div>
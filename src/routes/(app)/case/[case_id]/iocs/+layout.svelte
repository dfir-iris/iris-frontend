<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { 
		FilterIcon, 
		RefreshCwIcon,
		XIcon,
		Trash2Icon, // Added
		CheckIcon, // Added (though might not be used directly if text is preferred)
		DownloadIcon // Added
	} from 'lucide-svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { ApiService } from '$lib/services/api.service';
	import type { Ioc } from '$lib/types/resources/ioc';
	import type { Paginated } from '$lib/services/api.service';
	import * as Resizable from "$lib/components/ui/resizable/index.js";
	import IocCard from '$lib/components/common/ioc/IocCard.svelte';
	import { iocsStore } from '$lib/stores/iocs.store';
	import AddIocButton from '$lib/components/common/assets/add-asset-button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Badge } from '$lib/components/ui/badge';
	import { Checkbox } from '$lib/components/ui/checkbox'; // Added
	import { toast } from '$lib/components/ui/toast'; // Added
	import { cn } from '$lib/utils'; // Added
  import { deduplicateIocs } from '$lib/utils/iocs.utils'; 
	import { deduplicateAssets, escapeCSVValue, convertToCSV, AVAILABLE_EXPORT_COLUMNS, type ExportColumn } from '$lib/utils/asset.utils'; 
	import DownloadModal from '$lib/components/common/DownloadModal.svelte'; // New import

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	
	// State for infinite scrolling
	let ioc = $state<Ioc[]>([]);
	let displayIocs = $state<Ioc[]>([]);
	// let storeIocs = $state<Record<string, Ioc>>({}); // No longer needed directly like this for display
	let totalIocs = $state(0);
	let currentPage = $state(1);
	let nextPage = $state<number | null>(null);
	let lastPage = $state<number | null>(null);
	let isLoading = $state(false);
	let isRefreshing = $state(false);
	let observer: IntersectionObserver | null = null;
	let loadMoreTrigger: HTMLDivElement | null = null;
	let scrollContainer = $state<HTMLDivElement | null>(null);
	let searchTerm = $state('');
	let searchDebounceTimer: number;
	let refreshCounter = $state(0); // Add a counter to force reactivity
	let initialFetchDone = $state(false); // Declare and initialize initialFetchDone
	
	// Filter state
	let showFilterDropdown = $state(false);
	let selectedFilters = $state<string[]>([]);

	// Selection state
	let selectionMode = $state(false);
	let selectedIocs = $state<Set<string>>(new Set());
	let isRemovingSelected = $state(false);

	// Download state
	let showDownloadModal = $state(false);
	let isDownloadingModal = $state(false); 
	let downloadProgressMessage = $state(''); 

	const caseId = $derived($page.params.case_id); // Get caseId from page params

	// Filter options
	const filterOptions = [
		{ id: 'compromised', label: 'Compromised Iocs', field: 'ioc_compromise_status_id', value: 1, operator: 'eq' },
		{ id: 'non_compromised', label: 'Non Compromised Iocs', field: 'ioc_compromise_status_id', value: 1, operator: 'not' },
		{ id: 'analysis_done', label: 'Analysis Done', field: 'analysis_status_id', value: 6, operator: 'eq'  },
		{ id: 'analysis_started', label: 'Analysis Started', field: 'analysis_status_id', value: 3, operator: 'eq' },
		{ id: 'analysis_todo', label: 'Analysis To Be done', field: 'analysis_status_id', value: 2, operator: 'eq' },
	];
	
	// Subscribe to the ioc store for display purposes and nonce changes
	let currentListRefreshNonce = $state(0);
	const unsubscribe = iocsStore.subscribe(storeState => {
		currentListRefreshNonce = storeState.listRefreshNonce;

		// Update displayIocs based on the store's ioc.
		// This ensures that if the store is updated by other means (e.g. asset detail page edit),
		// the list reflects it.
		if (initialFetchDone) { 
			// `ioc` holds the list of ioc for the current API view (paginated/filtered).
			// `storeState.ioc` is the global map of all known ioc, potentially more up-to-date.
			
			// Reconstruct displayIocs:
			// For each asset that *should* be in the current view (i.e., it's in our `ioc` list),
			// get its latest version from the store.
			// If an asset from the `ioc` list is no longer in the store (deleted), it will be filtered out.
			const newDisplayIocs = ioc
				.map(assetFromApiList => {
					// Ensure assetFromApiList and its ID are valid before trying to access the store
					if (assetFromApiList && assetFromApiList.ioc_id != null) {
						return storeState.iocs[assetFromApiList.ioc_id.toString()];
					}
					return undefined; // Or handle as appropriate if an ID is missing
				})
				.filter(a => a !== undefined) as Ioc[]; // Filter out undefined entries and assert type

			displayIocs = deduplicateIocs(newDisplayIocs); // Use the deduplication utility
		}
	});
	
	// Clean up subscription on component destruction
	onDestroy(() => {
		unsubscribe();
		if (observer) { // Ensure observer is disconnected on destroy
			observer.disconnect();
		}
		clearTimeout(searchDebounceTimer); // Clear debounce timer on destroy
	});
	
	// Initialize with data from the server
	$effect(() => {
		if (data.data) {
			data.data.then((result) => {
				// Force reactivity by creating new arrays and deduplicate
				const initialIocs = deduplicateIocs([...result.data.data]);
				ioc = initialIocs;
				displayIocs = [...initialIocs]; // Initialize display ioc
				totalIocs = result.data.total;
				currentPage = result.data.current_page;
				nextPage = result.data.next_page;
				lastPage = result.data.last_page;
				
				// Add ioc to the store
				iocsStore.setIocs(initialIocs);
				
				initialFetchDone = true; // Set to true after initial fetch
				
				// Setup observer after initial data is loaded
				setupObserver();
			});
		}
	});

	// Effect to refresh ioc when listRefreshNonce changes
	let previousNonce = $state(0); // Track the previous nonce value processed by this effect
	let previousRoutedIocId = $state<string | undefined>(undefined); // For tracking ioc_id changes in route

	$effect(() => {
		// Only refresh if the nonce has actually changed to a new positive value
		// and is different from the last nonce that triggered a refresh.
		if (currentListRefreshNonce > 0 && currentListRefreshNonce !== previousNonce) {
			console.log(`Ioc list refresh triggered by store nonce change from ${previousNonce} to ${currentListRefreshNonce}.`);
			refreshIocs(1); // Refresh the first page
			previousNonce = currentListRefreshNonce; // Update previousNonce after refresh
		}
	});


	// Function to build custom conditions for search and filters
	function buildSearchConditions(term: string) {
		const conditions = [];
		
		// Add search term conditions if provided
		if (term) {
			conditions.push(
				{ field: "ioc_name", operator: "like", value: term },
				{ field: "ioc_ip", operator: "like", value: term },
				{ field: "ioc_domain", operator: "like", value: term },
				{ field: "ioc_description", operator: "like", value: term },
				{ field: "ioc_tags", operator: "like", value: term },
				{ field: "ioc_type.ioc_name", operator: "like", value: term }
			);
		}
		
		// Add filter conditions
		selectedFilters.forEach(filterId => {
			const filter = filterOptions.find(f => f.id === filterId);
			if (filter) {
				conditions.push({ field: filter.field, operator: filter.operator, value: filter.value });
			}
		});
		
		return conditions;
	}

	// Refresh ioc function - compatible with Svelte 5
	async function refreshIocs(pageNumber = 1) {
		if (isRefreshing) return;
		
		isRefreshing = true;
		try {
			const customConditions = buildSearchConditions(searchTerm);
			const params: Record<string, any> = { 
				page: pageNumber, 
				per_page: 10
			};

			if (customConditions.length > 0) {
				params.custom_conditions = JSON.stringify(customConditions);
			}

			const result = await ApiService.get<Paginated<Ioc>>(
				ENDPOINTS.case.ioc.list(page.params.case_id, params),
				{ fetch }
			);
			
			// Reset state with fresh data - force reactivity with new arrays and deduplicate
			ioc = deduplicateIocs([...result.data.data]);
			displayIocs = [...ioc]; // Update display ioc
			totalIocs = result.data.total;
			currentPage = result.data.current_page;
			nextPage = result.data.next_page;
			lastPage = result.data.last_page;
			refreshCounter++; // Increment counter to force reactivity
			
			// Update the store with new ioc from the first page
			iocsStore.setIocs(ioc);
			
			// Re-setup observer after refresh
			setupObserver();
			
			console.log('Iocs refreshed:', ioc.length, 'Display ioc:', displayIocs.length);
		} catch (error) {
			console.error('Failed to refresh ioc:', error);
		} finally {
			isRefreshing = false;
		}
	}

	// Load more ioc when scrolling
	async function loadMoreIocs() {
		if (!nextPage || isLoading) return;
		
		isLoading = true;
		try {
			const customConditions = buildSearchConditions(searchTerm);
			const params: Record<string, any> = { 
				page: currentPage + 1, 
				per_page: 10
			};

			if (customConditions.length > 0) {
				params.custom_conditions = JSON.stringify(customConditions);
			}

			const result = await ApiService.get<Paginated<Ioc>>(
				ENDPOINTS.case.ioc.list(page.params.case_id, params),
				{ fetch }
			);
			
			// Deduplicate new ioc
			const newIocs = deduplicateIocs([...result.data.data]);
			
			// Deduplicate combined ioc (existing + new)
			const combinedIocs = deduplicateIocs([...ioc, ...newIocs]);
			
			// Force reactivity with new arrays
			ioc = combinedIocs;
			displayIocs = [...ioc]; // Update display ioc
			currentPage = result.data.current_page;
			nextPage = result.data.next_page;
			lastPage = result.data.last_page;
			refreshCounter++; // Increment counter to force reactivity
			
			// Add new ioc to the store
			iocsStore.setIocs(newIocs);
			
			console.log('More ioc loaded:', ioc.length, 'Display ioc:', displayIocs.length);
		} catch (error) {
			console.error('Failed to load more ioc:', error);
		} finally {
			isLoading = false;
		}
	}

	// Toggle filter selection
	function toggleFilter(filterId: string) {
		if (selectedFilters.includes(filterId)) {
			removeFilter(filterId);
		} else {
			selectedFilters = [...selectedFilters, filterId];
			refreshIocs(1);
		}
	}
	
	// Remove filter
	function removeFilter(filterId: string) {
		selectedFilters = selectedFilters.filter(id => id !== filterId);
		refreshIocs(1);
	}

	// Watch for search term changes
	$effect(() => {
		console.log('Search term changed:', searchTerm); 
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			refreshIocs(1);
		}, 300) as unknown as number; 
	});
	
	// Watch for refresh counter changes to force reactivity
	$effect(() => {
		// This effect is just to make sure the component reacts to refreshCounter changes
	});
	
	// Setup intersection observer
	function setupObserver() {
		// Clean up existing observer if any
		if (observer) {
			observer.disconnect();
		}
		
		// Create new observer
		observer = new IntersectionObserver((entries) => {
			if (entries[0].isIntersecting && nextPage && !isLoading) { // Added !isLoading check
				loadMoreIocs();
			}
		}, { 
			rootMargin: '200px', // Increased margin to detect earlier
			threshold: 0.1 // Trigger when at least 10% of the element is visible
		});
		
		// Wait for next tick to ensure DOM is updated
		setTimeout(() => {
			if (loadMoreTrigger && observer) {
				observer.observe(loadMoreTrigger);
			}
		}, 0);
	}
	
	// Handle binding of the trigger element
	function handleTriggerRef(node: HTMLDivElement) {
		loadMoreTrigger = node;
		if (observer && node) {
			observer.observe(node);
		}
		return {
			destroy() {
				if (observer && node) {
					observer.unobserve(node);
				}
			}
		};
	}
	
	// Set up intersection observer for infinite scrolling
	onMount(() => {
		setupObserver();
	});
	
	// Clean up on component destruction
	onDestroy(() => {
		if (observer) {
			observer.disconnect();
		}
		clearTimeout(searchDebounceTimer); // Already present, ensure it's the one for search
	});

	// Handle scroll events for blur effect
	function handleScroll() {
		if (scrollContainer) {
			const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
			const scrollPercentage = scrollTop / (scrollHeight - clientHeight);
			scrollContainer.style.setProperty('--scroll-percentage', scrollPercentage.toString());
		}
	}

	// Default min/max sizes for the sidebar
	const defaultSidebarSize = 33; // 33% of the container
	const minSidebarSize = 20; // 20% of the container
	const maxSidebarSize = 60; // 60% of the container

	function scrollToSelectedIoc() {
		if (page.params.ioc_id && scrollContainer) {
			// Use requestAnimationFrame to sync with browser repaint cycle
			requestAnimationFrame(() => {
				const selectedIocElement = document.getElementById(`asset-card-${page.params.ioc_id}`);
				if (selectedIocElement) {
					selectedIocElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
			});
		}
	}

	// Effect to scroll to selected asset when the selected ioc_id in the URL changes
	$effect(() => {
		const currentIocIdInRoute = page.params.ioc_id;

		if (currentIocIdInRoute && !selectionMode && !isLoading) {
			// Only scroll if:
			// 1. The ioc_id in the URL has actually changed since the last check, OR
			// 2. It's the initial load (previousRoutedIocId is undefined) and an ioc_id is present,
			//    and initial data fetch is complete.
			// This prevents scrolling when displayIocs changes due to pagination if the route hasn't changed.
			if (initialFetchDone && currentIocIdInRoute !== previousRoutedIocId) {
				scrollToSelectedIoc();
			}
		}
		previousRoutedIocId = currentIocIdInRoute; // Update for the next comparison
	});

	// Selection functions
	function toggleSelectionMode() {
		selectionMode = !selectionMode;
		if (!selectionMode) {
			selectedIocs.clear();
		}
	}

	function toggleSelectAll() {
		if (selectedIocs.size === displayIocs.length) {
			selectedIocs.clear();
		} else {
			displayIocs.forEach(a => selectedIocs.add(a.ioc_id.toString()));
		}
		selectedIocs = selectedIocs; // Trigger reactivity
	}

	function handleIocSelection(iocId: string, isSelected: boolean) {
		if (isSelected) {
			selectedIocs.add(iocId);
		} else {
			selectedIocs.delete(iocId);
		}
		selectedIocs = selectedIocs; // Trigger reactivity for the set
	}

	async function removeSelectedIocs() {
		if (selectedIocs.size === 0) {
			toast.info('No IOCs selected for deletion.');
			return;
		}
		isRemovingSelected = true;
		const iocIdsToDelete = Array.from(selectedIocs);
		let successCount = 0;
		let errorCount = 0;

		for (const iocId of iocIdsToDelete) {
			try {
				const url = ENDPOINTS.case.ioc.delete(caseId, iocId);
				const response = await ApiService.delete(url, $page.fetch);
				if (response.ok || response.status === 204) {
					iocsStore.removeIoc(iocId); // Remove from store
					successCount++;
				} else {
					const errorData = response.data;
					console.error(`Failed to delete IOC ${iocId}:`, errorData?.message || response.status);
					errorCount++;
				}
			} catch (error) {
				console.error(`Error deleting IOC ${iocId}:`, error);
				errorCount++;
			}
		}

		if (successCount > 0) {
			toast.success(`${successCount} IOC(s) deleted successfully.`);
		}
		if (errorCount > 0) {
			toast.error(`${errorCount} IOC(s) failed to delete. Check console for details.`);
		}

		selectedIocs.clear();
		selectionMode = false;
		isRemovingSelected = false;
		// The store update should trigger reactivity and update displayIocs.
		// If not, a manual refreshIocs() or selective removal from 'ioc' and 'displayIocs' might be needed.
		// For now, relying on store reactivity.
	}

	function triggerDownload(csvContent: string, filename: string) {
		const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
		const link = document.createElement('a');
		if (link.download !== undefined) {
			const url = URL.createObjectURL(blob);
			link.setAttribute('href', url);
			link.setAttribute('download', filename);
			link.style.visibility = 'hidden';
			document.body.appendChild(link);
			link.click();
			document.body.removeChild(link);
			URL.revokeObjectURL(url);
		}
	}

	async function downloadVisibleIocs(selectedColumnsForExport: ExportColumn[]) {
		if (isDownloadingModal || displayIocs.length === 0 || selectedColumnsForExport.length === 0) {
			if (selectedColumnsForExport.length === 0) {
				toast({ title: "No Columns Selected", description: "Please select at least one column to export.", variant: "warning" });
			}
			return;
		}
		isDownloadingModal = true;
		downloadProgressMessage = 'Preparing visible ioc...';
		try {
			const csvData = convertToCSV(displayIocs, selectedColumnsForExport);
			triggerDownload(csvData, `iris_case_${page.params.case_id}_visible_ioc.csv`);
			toast({
				title: "Download Started",
				description: "Downloading visible ioc as CSV.",
				variant: "success"
			});
		} catch (error) {
			console.error('Failed to download visible ioc:', error);
			toast({
				title: "Download Error",
				description: "Could not download visible ioc. Check console for details.",
				variant: "destructive"
			});
		} finally {
			isDownloadingModal = false;
			downloadProgressMessage = '';
			showDownloadModal = false; // Close modal on completion/error
		}
	}

	async function downloadAllIocs(selectedColumnsForExport: ExportColumn[]) {
		if (isDownloadingModal || selectedColumnsForExport.length === 0) {
			if (selectedColumnsForExport.length === 0) {
				toast({ title: "No Columns Selected", description: "Please select at least one column to export.", variant: "warning" });
			}
			return;
		}
		isDownloadingModal = true;
		let allIocs: Ioc[] = [];
		let currentPageToFetch = 1;
		let hasMorePages = true;
		let totalFetched = 0;
		// Estimate total pages for progress, or use totalIocs if accurate for current filters
		const estimatedTotal = totalIocs; // Assuming totalIocs reflects filtered count

		downloadProgressMessage = "Fetching all ioc... (Page 1)";

		try {
			while(hasMorePages) {
				const customConditions = buildSearchConditions(searchTerm); // Use current filters/search
				const params: Record<string, any> = { 
					page: currentPageToFetch, 
					per_page: 100 // Fetch in larger chunks for "download all"
				};
				if (customConditions.length > 0) {
					params.custom_conditions = JSON.stringify(customConditions);
				}

				const result = await ApiService.get<Paginated<Ioc>>(
					ENDPOINTS.case.ioc.list(page.params.case_id, params),
					{ fetch }
				);
				
				allIocs = allIocs.concat(result.data.data);
				totalFetched += result.data.data.length;
				
				if (result.data.next_page) {
					currentPageToFetch++;
					downloadProgressMessage = `Fetching page ${currentPageToFetch}... (${totalFetched}/${estimatedTotal > 0 ? estimatedTotal : 'many'} ioc)`;
				} else {
					hasMorePages = false;
				}
			}

			if (allIocs.length > 0) {
				downloadProgressMessage = `Generating CSV for ${allIocs.length} ioc...`;
				const csvData = convertToCSV(deduplicateIocs(allIocs), selectedColumnsForExport); 
				triggerDownload(csvData, `iris_case_${page.params.case_id}_all_ioc.csv`);
				toast({
					title: "Download Started",
					description: `Downloading ${allIocs.length} asset(s) as CSV.`,
					variant: "success"
				});
			} else {
				toast({
					title: "No Iocs",
					description: "No ioc found to download with the current filters.",
					variant: "default"
				});
			}

		} catch (error) {
			console.error('Failed to download all ioc:', error);
			toast({
				title: "Download Error",
				description: "Could not download all ioc. Check console for details.",
				variant: "destructive"
			});
		} finally {
			isDownloadingModal = false;
			downloadProgressMessage = '';
			showDownloadModal = false; // Close modal on completion/error
		}
	}

	function handleConfirmDownload(downloadType: 'visible' | 'all', selectedKeys: Set<string>) {
		if (selectedKeys.size === 0) {
			toast({ title: "No Columns Selected", description: "Please select at least one column to export.", variant: "warning" });
			return;
		}
		const columnsToExport = AVAILABLE_EXPORT_COLUMNS.filter(col => selectedKeys.has(col.key));

		if (downloadType === 'visible') {
			downloadVisibleIocs(columnsToExport);
		} else {
			downloadAllIocs(columnsToExport);
		}
	}


	// Effect to clear selection if filters change or search term changes significantly
	$effect(() => {
		if (selectionMode) {
			// This is a dependency on searchTerm and selectedFilters
			const currentSearchTerm = searchTerm;
			const currentFilters = selectedFilters.join(',');
			// If these change, it implies the list might change significantly.
			// For simplicity, we can exit selection mode.
			// More complex logic could try to preserve selection for items still visible.
			// exitSelectionMode(); 
			// Decided against auto-exiting for now, user can cancel.
		}
	});
</script>

<div class="flex h-full w-full">
	<Resizable.PaneGroup direction="horizontal" class="h-full w-full">
		<Resizable.Pane defaultSize={defaultSidebarSize} minSize={minSidebarSize} maxSize={maxSidebarSize} class="flex h-full flex-col gap-y-3 border-r bg-background/50 p-3">
			<!-- Top of sidebar with ioc count -->
			<div class="flex flex-col gap-y-2">
				<div class="flex flex-col md:flex-row md:items-center gap-2">
					<div class="flex flex-col">
						<h2 class="w-full text-lg font-semibold md:text-xl">Indicators</h2>
						<span class="text-xs md:text-sm text-muted-foreground">
							{#if selectionMode}
								{selectedIocs.size} of {displayIocs.length} selected (Total: {totalIocs})
							{:else}
								Showing {displayIocs.length} of {totalIocs} IOC
							{/if}
						</span>
					</div>
					<div class="flex-grow md:hidden"></div> 
					<div class="flex flex-col md:flex-row sm:flex-col gap-2 mt-2 md:ml-auto">
						{#if selectionMode}
							<Button 
								variant="outline" 
								size="sm" 
								onclick={selectAllVisibleIocs}
								disabled={displayIocs.length === 0 || selectedIocs.size === displayIocs.filter(a => a && a.ioc_id != null).length}
								class="text-xs"
							>
								Select All Visible
							</Button>
							<Button 
								variant="outline" 
								size="sm" 
								onclick={deselectAllIocs}
								disabled={selectedIocs.size === 0}
								class="text-xs"
							>
								Deselect All
							</Button>
							<Button 
								variant="destructive" 
								size="sm" 
								onclick={removeSelectedIocs}
								disabled={selectedIocs.size === 0 || isRemovingSelected}
								class="text-xs"
							>
								{#if isRemovingSelected}
									<RefreshCwIcon class="h-3.5 w-3.5 mr-1 animate-spin" /> Removing...
								{:else}
									<Trash2Icon class="h-3.5 w-3.5 mr-1" /> Remove Selected
								{/if}
							</Button>
							<Button 
								variant="ghost" 
								size="sm" 
								onclick={exitSelectionMode}
								class="text-xs"
							>
								<XIcon class="h-3.5 w-3.5 mr-1" /> Cancel
							</Button>
						{:else}
							<div class="flex flex-row gap-2 w-full sm:w-auto">
								<DropdownMenu.Root open={showFilterDropdown} onOpenChange={(open) => showFilterDropdown = open}>
									<DropdownMenu.Trigger class="w-full sm:w-auto">
										<Button variant="ghost" size="icon" class="w-full sm:w-auto p-2" disabled={isDownloadingModal}>
											<FilterIcon size={18}></FilterIcon>
											<span class="sr-only">Filter Iocs</span>
										</Button>
									</DropdownMenu.Trigger>
									<DropdownMenu.Content align="end" class="w-56">
										<DropdownMenu.Label>Filter Iocs</DropdownMenu.Label>
										<DropdownMenu.Separator />
										{#each filterOptions as option}
											<DropdownMenu.CheckboxItem 
												checked={selectedFilters.includes(option.id)}
												onclick={() => toggleFilter(option.id)}
											>
												{option.label}
											</DropdownMenu.CheckboxItem>
										{/each}
									</DropdownMenu.Content>
								</DropdownMenu.Root>
								<Button 
									variant="ghost" 
									size="icon" 
									onclick={toggleSelectionMode}
									disabled={displayIocs.length === 0 || isRefreshing || isLoading || isDownloadingModal}
									class="w-full sm:w-auto p-2"
								>
									<CheckIcon size={18}/>
								</Button>
								<Button 
									variant="ghost" 
									size="icon" 
									class="w-full sm:w-auto p-2" 
									disabled={isDownloadingModal || (displayIocs.length === 0 && totalIocs === 0)}
									onclick={() => showDownloadModal = true}
								>
									{#if isDownloadingModal}
										<RefreshCwIcon size={18} class="animate-spin" />
									{:else}
										<DownloadIcon size={18} />
									{/if}
									<span class="sr-only">Download Iocs</span>
								</Button>
								<Button 
									variant="ghost"
									size="icon" 
									onclick={() => refreshIocs(1)} 
									disabled={isRefreshing || isDownloadingModal} 
									class="w-full sm:w-auto p-2"
									>
									<RefreshCwIcon size={18} class={isRefreshing ? 'animate-spin' : ''} />
								</Button>
							</div>
							<AddIocButton class="w-full sm:w-auto" disabled={isDownloadingModal} />
						{/if}
					</div>
				</div>
				
				<!-- Selected filters display -->
				{#if selectedFilters.length > 0}
					<div class="flex flex-wrap gap-2 mt-1">
						{#each selectedFilters as filterId}
							{@const filter = filterOptions.find(f => f.id === filterId)}
							{#if filter}
								<Badge variant="outline" class="flex items-center gap-1 px-2 py-1 border-dashed">
									{filter.label}
									<button 
										class="ml-1 rounded-full hover:bg-muted p-0.5" 
										onclick={() => removeFilter(filterId)}
										aria-label={`Remove ${filter.label} filter`}
									>
										<XIcon size={14} />
									</button>
								</Badge>
							{/if}
						{/each}
					</div>
				{/if}
			</div>
			<Searchbar placeholder="Search ioc" bind:value={searchTerm} disabled={selectionMode}/>

			<!-- Sidebar items -->
			{#if displayIocs.length === 0 && (isLoading || isRefreshing)}
				{#each Array(5) as _}
					<div class="card-custom space-y-1.5 rounded-lg border p-3 text-sm shadow">
						<div class="flex flex-row gap-x-1">
							<Skeleton class="h-6 w-1/2 shrink-0"></Skeleton>
							<div class="w-full"></div>
							<Skeleton class="h-6 w-16"></Skeleton>
							<Skeleton class="h-6 w-16"></Skeleton>
						</div>
						<Skeleton class="h-4 w-1/2 shrink-0"></Skeleton>
						<Skeleton class="h-4 w-1/3 shrink-0"></Skeleton>
					</div>
				{/each}
			{:else}
				<div 
					bind:this={scrollContainer}
					onscroll={handleScroll}
					class="flex flex-col px-3 gap-y-3 overflow-y-auto max-h-[calc(100vh-200px)] relative scroll-smooth"
					style="
						--mask-image-content: linear-gradient(
							to bottom,
							transparent,
							hsl(var(--background)) var(--top-fade-stop, 3%),
							hsl(var(--background)) var(--bottom-fade-stop, 98%),
							transparent
						);
						mask-image: var(--mask-image-content);
						-webkit-mask-image: var(--mask-image-content);
					"
				>
					<div class="sticky top-0 h-8 bg-gradient-to-b from-background to-transparent pointer-events-none"></div>
					
					{#key refreshCounter}
						{#each displayIocs as ioc (ioc.ioc_id)} 
							{@const isSelectedForView = page.params.ioc_id === ioc.ioc_id.toString()}
							{@const isCheckedForSelection = selectedIocs.has(ioc.ioc_id.toString())}
							<div 
								class={cn(
									"relative transition-all duration-150 ease-in-out",
									selectionMode ? "py-1" : "" // Add some padding if needed for checkbox visibility
								)}
								role="button"
								tabindex="0"
								onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { if (selectionMode) toggleIocSelection(ioc.ioc_id.toString()); else if (ioc.ioc_id) page.goto(`/case/${page.params.case_id}/ioc/${asset.ioc_id}`);}}}
								onclick={() => { if (selectionMode) toggleIocSelection(ioc.ioc_id.toString()); }}
							>
								{#if selectionMode}
									<div class={cn(
										"absolute left-2 top-1/2 -translate-y-1/2 z-20 flex items-center justify-center h-full",
										"cursor-pointer" // Make the checkbox area explicitly clickable
									)}>
										<Checkbox 
											checked={isCheckedForSelection}
											aria-label={`Select IOC ${ioc.ioc_value}`}
											class="pointer-events-none"
										/>
									</div>
								{/if}
								<div class={cn(selectionMode ? "pl-10" : "")}>
									<IocCard 
										ioc={ioc} 
                    compact={false}
										isSelected={isSelectedForView && !selectionMode} 
									/>
								</div>
							</div>
						{/each}
					{/key}
					
					<!-- Infinite scroll trigger element -->
					<div use:handleTriggerRef class="h-20 w-full flex items-center justify-center">
						{#if isLoading && !isRefreshing}
							<div class="flex justify-center py-4">
								<Skeleton class="h-8 w-8 rounded-full" />
							</div>
						{:else if nextPage !== null}
							<Button variant="outline" onclick={loadMoreIocs} disabled={isLoading}>
								Load More
							</Button>
						{/if}
					</div>
					
					<!-- End of list message -->
					{#if nextPage === null && displayIocs.length > 0}
						<div class="text-center text-sm text-muted-foreground py-2">
							End of ioc list
						</div>
					{/if}
					<div class="sticky bottom-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none"></div>
				</div>
			{/if}
		</Resizable.Pane>
		
		<Resizable.Handle withHandle class="bg-muted hover:bg-muted-foreground/20" />
		
		<Resizable.Pane class="flex h-full flex-col gap-y-2 overflow-y-auto p-4">
			{@render children()}
		</Resizable.Pane>
	</Resizable.PaneGroup>
</div>

<DownloadModal
	bind:open={showDownloadModal}
	title="Download Iocs"
	itemNounPlural="ioc"
	availableColumns={AVAILABLE_EXPORT_COLUMNS}
	countVisible={displayIocs.length}
	countAll={totalIocs}
	isProcessing={isDownloadingModal}
	processingMessage={downloadProgressMessage}
	onConfirm={handleConfirmDownload}
	onOpenChange={(openState) => {
		showDownloadModal = openState;
		if (!openState) { // If modal is closed, ensure processing state is reset
			isDownloadingModal = false;
			downloadProgressMessage = '';
		}
	}}
/>

<style>
	/* Custom scrollbar styles */
	.overflow-y-auto {
		scrollbar-width: thin;
		scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
	}

	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: rgba(155, 155, 155, 0.5);
		border-radius: 10px;
		border: transparent;
	}

	/* Resizable handle styling */
	:global(.resizable-handle) {
		position: relative;
	}

	:global(.resizable-handle[data-resize-handle-active]) {
		background-color: var(--muted-foreground);
	}

	:global(.resizable-handle-with-handle) {
		position: relative;
		width: 2px;
		transition: background-color 0.2s;
	}

	:global(.resizable-handle-with-handle::before) {
		content: "";
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 4px;
		height: 24px;
		border-radius: 2px;
		background-color: var(--muted-foreground);
		opacity: 0.5;
		transition: opacity 0.2s;
	}

	:global(.resizable-handle-with-handle:hover::before),
	:global(.resizable-handle-with-handle[data-resize-handle-active]::before) {
		opacity: 1;
	}
</style>
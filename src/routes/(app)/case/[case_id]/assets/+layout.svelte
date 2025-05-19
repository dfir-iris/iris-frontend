<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { 
		FilterIcon, 
		RefreshCwIcon,
		XIcon
	} from 'lucide-svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { onMount, onDestroy } from 'svelte'; // Removed setContext
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { ApiService } from '$lib/services/api.service';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Paginated } from '$lib/services/api.service';
	import * as Resizable from "$lib/components/ui/resizable/index.js";
	import AssetCard from '$lib/components/common/assets/AssetCard.svelte';
	import { assetsStore } from '$lib/stores/assets.store';
	import AddAssetButton from '$lib/components/common/assets/add-asset-button.svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Badge } from '$lib/components/ui/badge';
	// Removed: import { ASSET_LIST_REFRESH_KEY } from '$lib/constants/contexts';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	
	// State for infinite scrolling
	let assets = $state<Asset[]>([]);
	let displayAssets = $state<Asset[]>([]);
	// let storeAssets = $state<Record<string, Asset>>({}); // No longer needed directly like this for display
	let totalAssets = $state(0);
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
	
	// Filter options
	const filterOptions = [
		{ id: 'compromised', label: 'Compromised Assets', field: 'asset_compromise_status_id', value: 1, operator: 'eq' },
		{ id: 'non_compromised', label: 'Non Compromised Assets', field: 'asset_compromise_status_id', value: 1, operator: 'not' },
		{ id: 'analysis_done', label: 'Analysis Done', field: 'analysis_status_id', value: 6, operator: 'eq'  },
		{ id: 'analysis_started', label: 'Analysis Started', field: 'analysis_status_id', value: 3, operator: 'eq' },
		{ id: 'analysis_todo', label: 'Analysis To Be done', field: 'analysis_status_id', value: 2, operator: 'eq' },
	];
	
	// Function to deduplicate assets by ID
	function deduplicateAssets(assetList: Asset[]): Asset[] {
		const seen = new Set<string>();
		return assetList.filter(asset => {
			const id = asset.asset_id.toString();
			if (seen.has(id)) {
				return false;
			}
			seen.add(id);
			return true;
		});
	}
	
	// Subscribe to the assets store for display purposes and nonce changes
	let currentListRefreshNonce = $state(0);
	const unsubscribe = assetsStore.subscribe(storeState => {
		currentListRefreshNonce = storeState.listRefreshNonce;

		// Update displayAssets based on the store's assets.
		// This ensures that if the store is updated by other means (e.g. asset detail page edit),
		// the list reflects it.
		if (initialFetchDone) { 
			// `assets` holds the list of assets for the current API view (paginated/filtered).
			// `storeState.assets` is the global map of all known assets, potentially more up-to-date.
			
			// Reconstruct displayAssets:
			// For each asset that *should* be in the current view (i.e., it's in our `assets` list),
			// get its latest version from the store.
			// If an asset from the `assets` list is no longer in the store (deleted), it will be filtered out.
			const newDisplayAssets = assets
				.map(assetFromApiList => {
					// Ensure assetFromApiList and its ID are valid before trying to access the store
					if (assetFromApiList && assetFromApiList.asset_id != null) {
						return storeState.assets[assetFromApiList.asset_id.toString()];
					}
					return undefined; // Or handle as an error/log if this case is unexpected
				})
				.filter(Boolean) as Asset[]; // Filter out undefined (deleted) assets and assert type

			// To ensure reactivity, always assign the new array if the store has changed.
			// Svelte's keyed #each will efficiently update the DOM.
			// A more optimized approach would compare newDisplayAssets with displayAssets
			// before assigning, but direct assignment is more robust for debugging reactivity.
			displayAssets = newDisplayAssets;
		}
	});
	
	// Clean up subscription on component destruction
	onDestroy(() => {
		unsubscribe();
	});
	
	// Initialize with data from the server
	$effect(() => {
		if (data.data) {
			data.data.then((result) => {
				// Force reactivity by creating new arrays and deduplicate
				const initialAssets = deduplicateAssets([...result.data.data]);
				assets = initialAssets;
				displayAssets = [...initialAssets]; // Initialize display assets
				totalAssets = result.data.total;
				currentPage = result.data.current_page;
				nextPage = result.data.next_page;
				lastPage = result.data.last_page;
				
				// Add assets to the store
				assetsStore.setAssets(initialAssets);
				
				initialFetchDone = true; // Set to true after initial fetch
				
				// Setup observer after initial data is loaded
				setupObserver();
			});
		}
	});

	// Effect to refresh assets when listRefreshNonce changes
	let previousNonce = $state(0); // Track the previous nonce value processed by this effect

	$effect(() => {
		// Only refresh if the nonce has actually changed to a new positive value
		// and is different from the last nonce that triggered a refresh.
		if (currentListRefreshNonce > 0 && currentListRefreshNonce !== previousNonce) {
			console.log(`Asset list refresh triggered by store nonce change from ${previousNonce} to ${currentListRefreshNonce}.`);
			refreshAssets(1); // Refresh the first page
			previousNonce = currentListRefreshNonce; // Update previousNonce after refresh
		}
	});


	// Function to build custom conditions for search and filters
	function buildSearchConditions(term: string) {
		const conditions = [];
		
		// Add search term conditions if provided
		if (term) {
			conditions.push(
				{ field: "asset_name", operator: "like", value: term },
				{ field: "asset_ip", operator: "like", value: term },
				{ field: "asset_domain", operator: "like", value: term },
				{ field: "asset_description", operator: "like", value: term },
				{ field: "asset_tags", operator: "like", value: term },
				{ field: "asset_type.asset_name", operator: "like", value: term }
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

	// Refresh assets function - compatible with Svelte 5
	async function refreshAssets(pageNumber = 1) {
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

			const result = await ApiService.get<Paginated<Asset>>(
				ENDPOINTS.case.assets.list(page.params.case_id, params),
				{ fetch }
			);
			
			// Reset state with fresh data - force reactivity with new arrays and deduplicate
			assets = deduplicateAssets([...result.data.data]);
			displayAssets = [...assets]; // Update display assets
			totalAssets = result.data.total;
			currentPage = result.data.current_page;
			nextPage = result.data.next_page;
			lastPage = result.data.last_page;
			refreshCounter++; // Increment counter to force reactivity
			
			// Update the store with new assets from the first page
			assetsStore.setAssets(assets);
			
			// Re-setup observer after refresh
			setupObserver();
			
			console.log('Assets refreshed:', assets.length, 'Display assets:', displayAssets.length);
		} catch (error) {
			console.error('Failed to refresh assets:', error);
		} finally {
			isRefreshing = false;
		}
	}

	// Load more assets when scrolling
	async function loadMoreAssets() {
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

			const result = await ApiService.get<Paginated<Asset>>(
				ENDPOINTS.case.assets.list(page.params.case_id, params),
				{ fetch }
			);
			
			// Deduplicate new assets
			const newAssets = deduplicateAssets([...result.data.data]);
			
			// Deduplicate combined assets (existing + new)
			const combinedAssets = deduplicateAssets([...assets, ...newAssets]);
			
			// Force reactivity with new arrays
			assets = combinedAssets;
			displayAssets = [...assets]; // Update display assets
			currentPage = result.data.current_page;
			nextPage = result.data.next_page;
			lastPage = result.data.last_page;
			refreshCounter++; // Increment counter to force reactivity
			
			// Add new assets to the store
			assetsStore.setAssets(newAssets);
			
			console.log('More assets loaded:', assets.length, 'Display assets:', displayAssets.length);
		} catch (error) {
			console.error('Failed to load more assets:', error);
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
			refreshAssets(1);
		}
	}
	
	// Remove filter
	function removeFilter(filterId: string) {
		selectedFilters = selectedFilters.filter(id => id !== filterId);
		refreshAssets(1);
	}

	// Watch for search term changes
	$effect(() => {
		console.log('Search term changed:', searchTerm); 
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			refreshAssets(1);
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
			if (entries[0].isIntersecting && nextPage) {
				loadMoreAssets();
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

	function scrollToSelectedAsset() {
		if (page.params.asset_id && scrollContainer) {
			// Use a timeout to ensure the DOM is updated after list changes
			setTimeout(() => {
				const selectedAssetElement = document.getElementById(`asset-card-${page.params.asset_id}`);
				if (selectedAssetElement) {
					selectedAssetElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
				}
			}, 50); // A small delay should be sufficient
		}
	}

	// Effect to scroll to selected asset when displayAssets or selected asset_id changes
	$effect(() => {
		// This effect depends on displayAssets to ensure it runs after the list is potentially re-rendered.
		// It also depends on page.params.asset_id to run when the selection changes.
		const currentDisplayAssets = displayAssets; // Create a dependency
		const currentAssetId = page.params.asset_id; // Create a dependency
		
		if (currentAssetId) {
			scrollToSelectedAsset();
		}
	});
</script>

<div class="flex h-full w-full">
	<Resizable.PaneGroup direction="horizontal" class="h-full w-full">
		<Resizable.Pane defaultSize={defaultSidebarSize} minSize={minSidebarSize} maxSize={maxSidebarSize} class="flex h-full flex-col gap-y-3 border-r bg-background/50 p-3 md:p-6">
			<!-- Top of sidebar with asset count -->
			<div class="flex flex-col gap-y-2">
				<div class="flex flex-col md:flex-row md:items-center gap-2">
					<div class="flex flex-col">
						<h2 class="w-full text-lg font-semibold md:text-xl">Assets</h2>
						<span class="text-xs md:text-sm text-muted-foreground">Showing {displayAssets.length} of {totalAssets} assets</span>
					</div>
					<div class="flex-grow md:hidden"></div> 
					<div class="flex flex-col md:flex-row sm:flex-col gap-2 mt-2 md:ml-auto">
						<div class="flex gap-2 w-full sm:w-auto">
							<DropdownMenu.Root open={showFilterDropdown} onOpenChange={(open) => showFilterDropdown = open}>
								<DropdownMenu.Trigger class="w-full sm:w-auto">
									<Button variant="outline" size="icon" class="w-full sm:w-auto p-2">
										<FilterIcon size={18}></FilterIcon>
										<span class="sr-only">Filter Assets</span>
									</Button>
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end" class="w-56">
									<DropdownMenu.Label>Filter Assets</DropdownMenu.Label>
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
							<Button variant="outline" onclick={() => refreshAssets(1)} disabled={isRefreshing} class="shrink-0 w-full sm:w-auto">
								<RefreshCwIcon size={18} class={isRefreshing ? 'animate-spin' : ''} />
								<span class="hidden sm:inline ml-1.5">Refresh</span>
								<span class="sm:hidden">Refresh</span>
							</Button>
						</div>
						<AddAssetButton class="w-full sm:w-auto" />
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
			<Searchbar placeholder="Search assets" bind:value={searchTerm} />

			<!-- Sidebar items -->
			{#if displayAssets.length === 0 && (isLoading || isRefreshing)}
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
						{#each displayAssets as asset (asset.asset_id)} 
							{@const isSelected = page.params.asset_id === asset.asset_id.toString()}
							<AssetCard {asset} {isSelected} />
						{/each}
					{/key}
					
					<!-- Infinite scroll trigger element -->
					<div use:handleTriggerRef class="h-20 w-full flex items-center justify-center">
						{#if isLoading && !isRefreshing}
							<div class="flex justify-center py-4">
								<Skeleton class="h-8 w-8 rounded-full" />
							</div>
						{:else if nextPage !== null}
							<Button variant="outline" onclick={loadMoreAssets} disabled={isLoading}>
								Load More
							</Button>
						{/if}
					</div>
					
					<!-- End of list message -->
					{#if nextPage === null && displayAssets.length > 0}
						<div class="text-center text-sm text-muted-foreground py-2">
							End of assets list
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
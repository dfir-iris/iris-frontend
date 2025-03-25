<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { 
		FilterIcon, 
		PlusIcon, 
		RefreshCwIcon
	} from 'lucide-svelte';
	import type { LayoutData } from './$types';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { ApiService } from '$lib/services/api.service';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Paginated } from '$lib/services/api.service';
	import * as Resizable from "$lib/components/ui/resizable/index.js";
	import AssetCard from '$lib/components/common/assets/AssetCard.svelte';
	import { assetsStore } from '$lib/stores/assets.store';
	import AddAssetButton from '$lib/components/common/assets/add-asset-button.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	
	// State for infinite scrolling
	let assets = $state<Asset[]>([]);
	let displayAssets = $state<Asset[]>([]);
	let storeAssets = $state<Record<string, Asset>>({});
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
	
	// Subscribe to the assets store
	const unsubscribe = assetsStore.subscribe(updatedStoreAssets => {
		storeAssets = updatedStoreAssets;
		
		// Only update displayAssets if we have assets loaded
		if (assets.length > 0) {
			// Create a new array with updated assets from the store
			const updatedAssets = assets.map(asset => {
				const assetId = asset.asset_id.toString();
				const storeAsset = storeAssets[assetId];
				
				// If we have this asset in the store, use it, otherwise use the original
				if (storeAsset) {
					return storeAsset;
				}
				return asset;
			});
			
			// Force reactivity by creating a new array
			displayAssets = [...updatedAssets];
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
				assets = deduplicateAssets([...result.data.data]);
				displayAssets = [...assets]; // Initialize display assets
				totalAssets = result.data.total;
				currentPage = result.data.current_page;
				nextPage = result.data.next_page;
				lastPage = result.data.last_page;
				
				// Add assets to the store
				assetsStore.setAssets(assets);
				
				// Setup observer after initial data is loaded
				setupObserver();
			});
		}
	});

	// Function to build custom conditions for search
	function buildSearchConditions(term: string) {
		if (!term) return [];
		return [
			{ field: "asset_name", operator: "like", value: term },
			{ field: "asset_ip", operator: "like", value: term },
			{ field: "asset_domain", operator: "like", value: term },
			{ field: "asset_description", operator: "like", value: term },
			{ field: "asset_tags", operator: "like", value: term },
			{ field: "asset_type.asset_name", operator: "like", value: term }
		];
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
			
			// Update the store with new assets
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
</script>

<div class="flex h-full w-full">
	<Resizable.PaneGroup direction="horizontal" class="h-full w-full">
		<Resizable.Pane defaultSize={defaultSidebarSize} minSize={minSidebarSize} maxSize={maxSidebarSize} class="flex h-full flex-col gap-y-3 border-r bg-background/50 p-6">
			<!-- Top of sidebar with asset count -->
			<div class="flex flex-row items-center gap-x-2">
				<div class="flex flex-col">
					<h2 class="w-full">Assets</h2>
					<span class="text-sm text-muted-foreground">Showing {displayAssets.length} of {totalAssets} assets</span>
				</div>
				<div class="flex-grow"></div>
				<Button variant="outline" size="icon" class="shrink-0">
					<FilterIcon size={20}></FilterIcon>
				</Button>
				<Button variant="outline" onclick={() => refreshAssets(1)} disabled={isRefreshing}>
					<RefreshCwIcon size={20} class={isRefreshing ? 'animate-spin' : ''} />
					Refresh
				</Button>
				<AddAssetButton />
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
							black var(--top-fade-stop, 3%),
							black var(--bottom-fade-stop, 98%),
							transparent
						);
						mask-image: var(--mask-image-content);
						-webkit-mask-image: var(--mask-image-content);
					"
				>
					<div class="sticky top-0 h-8 bg-gradient-to-b from-background to-transparent pointer-events-none"></div>
					
					{#key refreshCounter}
						{#each displayAssets as asset, index (asset.asset_id + '-' + index)}
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
							<div class="text-center text-sm text-muted-foreground py-2">
								Scroll for more
							</div>
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
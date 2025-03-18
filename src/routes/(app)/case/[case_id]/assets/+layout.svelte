<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { 
		ShieldAlert, 
		BiohazardIcon, 
		FilterIcon, 
		PlusIcon, 
		RefreshCwIcon, 
		TagIcon, 
		Server, 
		Globe, 
		Laptop, 
		Copy,
		CheckCheck,
		Network,
		Shield,
		Database,
		HardDrive,
		Smartphone,
		Printer,
		Router,
		Cpu,
		Cloud,
		Users,
		Mail,
		FileText,
		Lock,
		Cog,
		HelpCircle
	} from 'lucide-svelte';
	import type { LayoutData } from './$types';
	import { Badge } from '$lib/components/ui/badge';
	import { page } from '$app/state';
	import type { Snippet } from 'svelte';
	import { onMount, onDestroy } from 'svelte';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { ApiService } from '$lib/services/api.service';
	import type { Asset } from '$lib/types/resources/asset';
	import type { Paginated } from '$lib/services/api.service';
	import { TooltipProvider, TooltipTrigger, Tooltip, TooltipContent } from '$lib/components/ui/tooltip';
	import ClipboardCopy from '$lib/components/ui/clipboard-copy/clipboard-copy.svelte';
	import * as Resizable from "$lib/components/ui/resizable/index.js";
	import { goto } from '$app/navigation';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
	
	// State for infinite scrolling
	let assets = $state<Asset[]>([]);
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
	


	// Asset type to icon mapping
	const assetTypeIcons = {
		server: Server,
		domain: Globe,
		website: Globe,
		workstation: Laptop,
		network: Network,
		firewall: Shield,
		database: Database,
		storage: HardDrive,
		mobile: Smartphone,
		printer: Printer,
		router: Router,
		switch: Router,
		iot: Cpu,
		cloud: Cloud,
		account: Users,
		email: Mail,
		document: FileText,
		application: Cog,
		security: Lock,
		// Add more mappings as needed
	};
	
	// Get asset type icon
	function getAssetTypeIcon(asset: Asset) {
		const typeName = asset.asset_type?.asset_name?.toLowerCase() || '';
		
		// Check for exact matches first
		if (typeName in assetTypeIcons) {
			return assetTypeIcons[typeName as keyof typeof assetTypeIcons];
		}
		
		// Check for partial matches
		for (const [key, value] of Object.entries(assetTypeIcons)) {
			if (typeName.includes(key)) {
				return value;
			}
		}
		
		// Fallback to a generic icon for unknown types
		return HelpCircle;
	}
	
	// Initialize with data from the server
	$effect(() => {
		if (data.data) {
			data.data.then((result) => {
				assets = result.data.data;
				totalAssets = result.data.total;
				currentPage = result.data.current_page;
				nextPage = result.data.next_page;
				lastPage = result.data.last_page;
				
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
			{ field: "asset_description", operator: "like", value: term }
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
			
			// Reset state with fresh data
			assets = result.data.data;
			totalAssets = result.data.total;
			currentPage = result.data.current_page;
			nextPage = result.data.next_page;
			lastPage = result.data.last_page;
			
			// Re-setup observer after refresh
			setupObserver();
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
			
			assets = [...assets, ...result.data.data];
			currentPage = result.data.current_page;
			nextPage = result.data.next_page;
			lastPage = result.data.last_page;
		} catch (error) {
			console.error('Failed to load more assets:', error);
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		console.log('Search term changed:', searchTerm); 
		clearTimeout(searchDebounceTimer);
		searchDebounceTimer = setTimeout(() => {
			refreshAssets(1);
		}, 300) as unknown as number; 
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
					<span class="text-sm text-muted-foreground">Showing {assets.length} of {totalAssets} assets</span>
				</div>
				<div class="flex-grow"></div>
				<Button variant="outline" size="icon" class="shrink-0">
					<FilterIcon size={20}></FilterIcon>
				</Button>
				<Button variant="outline" onclick={refreshAssets} disabled={isRefreshing}>
					<RefreshCwIcon size={20} class={isRefreshing ? 'animate-spin' : ''} />
					Refresh
				</Button>
				<Button>
					<PlusIcon size={20}></PlusIcon>
					Add
				</Button>
			</div>
			<Searchbar placeholder="Search assets" bind:value={searchTerm} />

			<!-- Sidebar items -->
			{#if assets.length === 0 && (isLoading || isRefreshing)}
				{#each Array(5) as _}
					<div class="space-y-1.5 rounded border bg-background p-3 text-sm shadow">
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
					{#each assets as asset}
						{@const isSelected = page.params.asset_id === asset.asset_id.toString()}
						{@const AssetTypeIcon = getAssetTypeIcon(asset)}
						{@const hasIocs = (asset.iocs ?? []).length > 0}
						{@const hasTags = asset.asset_tags.split(',')?.length - 1> 0}
						{@const assetIp = asset.asset_ip || ''}
						{@const assetDomain = asset.asset_domain || ''}
						{@const isCompromised = asset.asset_compromise_status_id === 1}
						
						<button type="button" 
							class="w-full text-left rounded-xl border p-4 text-sm shadow transition-all duration-200 ease-in-out hover:scale-[1.01] hover:shadow-md group {
								isSelected
									? 'bg-accent text-accent-foreground border-primary/30'
									: 'bg-background hover:bg-background/80'
							}"
							onclick={() => goto(`/case/${page.params.case_id}/assets/${asset.asset_id}`)}
							aria-label={`View details for asset ${asset.asset_name}`}
						>
							<!-- Asset header with name and status -->
							<div class="flex items-center justify-between mb-2">
								<div class="flex items-center gap-2 w-full overflow-hidden">
									<div 
										class={`flex h-8 w-8 items-center justify-center rounded-full ${
											isSelected ? 'bg-primary/20' : 'bg-muted'
										}`}
									>
										<AssetTypeIcon
											size={16} 
											class={isCompromised ? 'text-red-500' : (isSelected ? 'text-primary' : 'text-muted-foreground')} 
										/>
									</div>
									
									<div class="flex-1 min-w-0">
										<div class="flex items-center gap-1 group">
											<span class="truncate text-base font-semibold">
												{asset.asset_name}
											</span>
											
											<ClipboardCopy 
												value={asset.asset_name} 
												tooltipText="Copy asset name" 
												className="ml-1 opacity-0 group-hover:opacity-100"
											/>
										</div>
										
										<div class="text-xs text-muted-foreground truncate">
											{asset.asset_type?.asset_name || asset.asset_type_id || 'Unknown type'}
										</div>
									</div>
								</div>
								
								<div class="flex items-center gap-1 flex-shrink-0 ml-2">
									{#if hasIocs}
										<Badge tooltip="Contains IOCs" icon={BiohazardIcon} variant="secondary">{asset.iocs?.length}</Badge>
									{/if}
									
									{#if isCompromised}
										<Badge variant="destructive">Compromised</Badge>
									{/if}									
								</div>
							</div>
							
							<!-- Asset details (IP/Domain) -->
							<div class="flex flex-col gap-1 mt-1">
								{#if assetIp}
									<div class="flex items-center gap-1 text-xs font-mono text-muted-foreground group">
										<span class="text-xs font-normal text-muted-foreground">IP:</span>
										<span class="truncate">{assetIp}</span>
										<ClipboardCopy 
											value={assetIp} 
											className="opacity-0 group-hover:opacity-100 ml-1"
										/>
									</div>
								{/if}
								
								{#if assetDomain}
									<div class="flex items-center gap-1 text-xs font-mono text-muted-foreground group">
										<span class="text-xs font-normal text-muted-foreground">Domain:</span>
										<span class="truncate">{assetDomain}</span>
										<ClipboardCopy 
											value={assetDomain} 
											className="opacity-0 group-hover:opacity-100 ml-1"
										/>
									</div>
								{/if}
								
								{#if !assetIp && !assetDomain}
									<div class="text-xs italic text-muted-foreground">No address information</div>
								{/if}

								{#if hasTags}
									<div class="flex flex-wrap gap-1 text-xs text-muted-foreground mt-1">
										{#each asset.asset_tags.split(',') as tag}
											<Badge 
												class="text-muted-foreground text-xs" 
												icon={TagIcon} 
												variant="secondary"
												><span class="">{tag}</span></Badge>
										{/each}
									</div>
								{/if}
							</div>
						</button>
					{/each}
					
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
					{#if nextPage === null && assets.length > 0}
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
<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { ShieldAlert, BiohazardIcon, FilterIcon, PlusIcon, RefreshCwIcon, TagIcon } from 'lucide-svelte';
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

	// Refresh assets function - compatible with Svelte 5
	async function refreshAssets() {
		if (isRefreshing) return;
		
		isRefreshing = true;
		try {
			const result = await ApiService.get<Paginated<Asset>>(
				ENDPOINTS.case.assets.list(page.params.case_id, { page: 1, per_page: 10 }),
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
			const result = await ApiService.get<Paginated<Asset>>(
				ENDPOINTS.case.assets.list(page.params.case_id, { page: currentPage + 1, per_page: 10 }),
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
		const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
		const scrollPercentage = scrollTop / (scrollHeight - clientHeight);

		scrollContainer.style.setProperty('--scroll-percentage', scrollPercentage.toString());
	}
</script>

<div class="flex h-full flex-row">
	<div class="flex h-full w-1/3 shrink-0 flex-col gap-y-3 border-r bg-background/50 p-6">
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
		<Searchbar placeholder="Search assets" />

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
					<div class="rounded-xl border p-3 text-sm shadow transition-all duration-200 ease-in-out hover:scale-[1.02] hover:shadow-md {
						page.params.asset_id === asset.asset_id.toString()
							? 'bg-accent text-accent-foreground'
							: 'bg-background hover:bg-background/80'
					}">
						<div class="flex flex-row gap-x-1">
							<!-- Asset name & address -->
							<a
								class="w-full justify-start text-base font-semibold"
								href="/case/{page.params.case_id}/assets/{asset.asset_id}"
								>{asset.asset_name}
							</a>

							{#if asset.asset_compromise_status_id === 1}
									<TooltipProvider>
										<Tooltip delayDuration={100}>
											<TooltipTrigger class="cursor-default">
												<div class="animate-pulse">
													<ShieldAlert size={18} class="text-red-500" />
												</div>
											</TooltipTrigger>
											<TooltipContent>												
													<p class="text-xs">Compromised</p>
											</TooltipContent>
										</Tooltip>
									</TooltipProvider>
							{/if}
							<!-- Counter badges of iocs/tags -->
							<Badge tooltip="IOCs" icon={BiohazardIcon} variant="secondary"
								>{asset.ioc_links?.length || '0'}</Badge
							>
							<Badge tooltip="Tags" icon={TagIcon} variant="secondary"
								>{asset.asset_tags?.length || '0'}</Badge
							>
						</div>
						<p class="w-full text-muted-foreground">
							{asset.asset_type?.asset_name || asset.asset_type_id}
							<span class="text-xs font-mono"
							>({ `${asset.asset_ip}` || asset.asset_domain || 'no address'})</span>
						</p>
					</div>
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
	</div>

	<div class="flex h-full w-full flex-col gap-y-2 overflow-y-auto p-4">
		{@render children()}
	</div>
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
</style>
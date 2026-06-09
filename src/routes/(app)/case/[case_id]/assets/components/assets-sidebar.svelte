<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { RefreshCwIcon, List, Grid } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import type { ListCaseAssetsParams } from '$lib/services/case-assets.service';
	import type { Asset } from '$lib/types/resources/asset';
	import { Button } from '$lib/components/ui/button';
	import {
		AdvancedSearch,
		type SearchField,
		type SearchCondition
	} from '$lib/components/ui/advanced-search';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import AssetCard from '$lib/components/common/assets/AssetCard.svelte';
	import AssetDataTable from '$lib/components/common/assets/AssetDataTable.svelte';
	import { getAssetUrl } from '../helpers';
	import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';
	import { Tooltip, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';

	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);

	let isLoading = $state(false);
	let isRefreshing = $state(false);
	let searchTerm = $state('');
	let searchConditions = $state<SearchCondition[]>([]);
	let searchDebounceTimer: number | undefined;

	let viewMode = $state<'cards' | 'table'>('cards');
	let selectedFilters = $state<string[]>([]);
	let selectionMode = $state(false);
	let selectedAssets = $state<Set<string>>(new Set());

	let observer: IntersectionObserver | null = null;
	let loadMoreTrigger: HTMLDivElement | null = null;

	const displayAssets = $derived(
		caseAssets.list.ids.map((id) => caseAssets.byId[id]).filter((a): a is Asset => !!a)
	);

	const selectedAssetId = $derived(
		page.params.asset_id ? Number(page.params.asset_id) : null
	);

	const filterOptions = [
		{
			id: 'compromised',
			label: 'Compromised',
			field: 'asset_compromise_status_id',
			value: 1,
			operator: 'eq'
		},
		{
			id: 'non_compromised',
			label: 'Non Compromised',
			field: 'asset_compromise_status_id',
			value: 1,
			operator: 'not'
		},
		{
			id: 'analysis_done',
			label: 'Analysis Done',
			field: 'analysis_status_id',
			value: 6,
			operator: 'eq'
		}
	];

	const searchFields: SearchField[] = [
		{ key: 'asset_name', label: 'Asset Name', type: 'text' },
		{ key: 'asset_ip', label: 'IP Address', type: 'text' },
		{ key: 'asset_domain', label: 'Domain', type: 'text' },
		{ key: 'asset_id', label: 'Asset ID', type: 'number' }
	];

	const buildConditions = () => {
		const out: Array<{ field: string; operator: string; value: string | number }> = [];

		searchConditions.forEach((c) => {
			if (c.field === '_raw') {
				out.push(
					{ field: 'asset_name', operator: 'like', value: c.value },
					{ field: 'asset_ip', operator: 'like', value: c.value },
					{ field: 'asset_domain', operator: 'like', value: c.value }
				);

				return;
			}

			out.push({ field: c.field, operator: c.operator, value: c.value });
		});

		if (searchTerm.trim() && searchConditions.length === 0) {
			out.push(
				{ field: 'asset_name', operator: 'like', value: searchTerm.trim() },
				{ field: 'asset_ip', operator: 'like', value: searchTerm.trim() },
				{ field: 'asset_domain', operator: 'like', value: searchTerm.trim() }
			);
		}

		selectedFilters.forEach((id) => {
			const filter = filterOptions.find((x) => x.id === id);

			if (filter) {
				out.push({ field: filter.field, operator: filter.operator, value: filter.value });
			}
		});

		return out;
	};

	const refreshAssets = async (pageNumber = 1) => {
		if (isRefreshing) return;

		isRefreshing = true;

		try {
			const conditions = buildConditions();

			const params: ListCaseAssetsParams = {
				page: pageNumber,
				per_page: caseAssets.list.params.per_page,
				custom_conditions: conditions.length > 0 ? JSON.stringify(conditions) : undefined
			};

			await caseAssets.listPaginated(params as ListCaseAssetsParams, { fetch });
		} finally {
			isRefreshing = false;
		}
	};

	const loadMore = async () => {
		if (caseAssets.list.nextPage === null || isLoading) return;

		isLoading = true;

		try {
			const previousIds = [...caseAssets.list.ids];

			await caseAssets.listPaginated(
				{
					page: caseAssets.list.currentPage + 1,
					per_page: caseAssets.list.params.per_page
				},
				{ fetch }
			);

			caseAssets.list.ids = [...new Set([...previousIds, ...caseAssets.list.ids])];
		} finally {
			isLoading = false;
		}
	};

	const setupObserver = () => {
		observer?.disconnect();

		observer = new IntersectionObserver((entries) => {
			if (entries[0]?.isIntersecting) {
				loadMore();
			}
		});

		setTimeout(() => {
			if (loadMoreTrigger) {
				observer?.observe(loadMoreTrigger);
			}
		}, 0);
	};

	const handleTriggerRef = (node: HTMLDivElement) => {
		loadMoreTrigger = node;
		observer?.observe(node);

		return {
			destroy: () => observer?.unobserve(node)
		};
	};

	const toggleAssetSelection = (assetId: string) => {
		if (selectedAssets.has(assetId)) {
			selectedAssets.delete(assetId);
		} else {
			selectedAssets.add(assetId);
		}

		selectedAssets = new Set(selectedAssets);
	};

	const openAsset = (assetId: number) =>
		goto(getAssetUrl(Number(page.params.case_id), String(assetId)));

	onMount(async () => {
		await refreshAssets(1);

		setupObserver();
	});

	onDestroy(() => {
		observer?.disconnect();

		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
		}
	});

	$effect(() => {
		const currentSearchTerm = searchTerm;
		const currentConditions = searchConditions;

		clearTimeout(searchDebounceTimer);

		searchDebounceTimer = window.setTimeout(() => {
			void currentSearchTerm;
			void currentConditions;
			refreshAssets(1);
		}, 300);
	});

	$effect(() => {
		if (selectedAssetId !== null) return;
		if (displayAssets.length === 0) return;

		const first = displayAssets[0];
		if (first) openAsset(first.asset_id);
	});
</script>

<div class="flex h-full min-h-0 flex-col gap-3 p-3">
	<div class="flex items-center gap-2">
		<h2 class="text-lg font-semibold">Assets</h2>

		<div class="ml-auto flex items-center gap-2">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button size="icon" variant="ghost" onclick={() => (viewMode = 'table')}>
							<List size={16} />
						</Button>
					</TooltipTrigger>

					<TooltipContent align="center" side="bottom">Table View</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button size="icon" variant="ghost" onclick={() => (viewMode = 'cards')}>
							<Grid size={16} />
						</Button>
					</TooltipTrigger>

					<TooltipContent align="center" side="bottom">Cards View</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button size="icon" variant="ghost" onclick={() => refreshAssets(1)}>
							<RefreshCwIcon size={16} class={isRefreshing ? 'animate-spin' : ''} />
						</Button>
					</TooltipTrigger>

					<TooltipContent align="center" side="bottom">Refresh</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	</div>

	<AdvancedSearch
		placeholder="Search assets..."
		bind:value={searchTerm}
		bind:conditions={searchConditions}
		fields={searchFields}
	/>

	<div class="min-h-0 flex-1">
		{#if viewMode === 'table'}
			<AssetDataTable
				className="h-full w-full"
				assets={displayAssets}
				caseId={page.params.case_id}
				tablePage={caseAssets.list.currentPage}
				totalPages={caseAssets.list.lastPage}
				perPage={caseAssets.list.params.per_page}
				on:pageChange={(e) => refreshAssets(e.detail.page)}
				on:pageSizeChange={(e) => {
					caseAssets.list.params.per_page = e.detail.pageSize;
					refreshAssets(1);
				}}
			/>
		{:else}
			<div class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
				{#each displayAssets as asset (asset.asset_id)}
					<div
						role="button"
						tabindex="0"
						onclick={() => {
							if (selectionMode) {
								toggleAssetSelection(asset.asset_id.toString());
							} else {
								openAsset(asset.asset_id);
							}
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();

								if (selectionMode) {
									toggleAssetSelection(asset.asset_id.toString());
								} else {
									openAsset(asset.asset_id);
								}
							}
						}}
					>
						<AssetCard {asset} isSelected={selectedAssetId === asset.asset_id} />
					</div>
				{/each}

				<div use:handleTriggerRef class="flex h-20 shrink-0 items-center justify-center">
					{#if isLoading}
						<Skeleton class="h-8 w-8 rounded-full" />
					{:else if caseAssets.list.nextPage !== null}
						<Button onclick={loadMore}>Load More</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

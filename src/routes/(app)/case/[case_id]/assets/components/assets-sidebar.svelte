<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { RefreshCwIcon, List, Grid, CheckSquareIcon, DownloadCloudIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		CASE_ASSETS_CTX,
		type CaseAssetsContext
	} from '$lib/contexts/case-assets.context.svelte';
	import { CaseAssetsService, type ListCaseAssetsParams } from '$lib/services/case-assets.service';
	import type { Asset } from '$lib/types/resources/asset';
	import DownloadModal from '$lib/components/common/DownloadModal.svelte';
	import { AVAILABLE_EXPORT_COLUMNS, convertToCSV } from '$lib/utils/asset.utils';
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
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { ChevronDownIcon } from 'lucide-svelte';
	import {
		AnalysisStatusService,
		type AnalysisStatusItem
	} from '$lib/services/analysis-status.service';

	const caseAssets = getContext<CaseAssetsContext>(CASE_ASSETS_CTX);

	let isLoading = $state(false);
	let isRefreshing = $state(false);
	let searchTerm = $state('');
	let searchConditions = $state<SearchCondition[]>([]);
	let searchDebounceTimer: number | undefined;

	let viewMode = $state<'cards' | 'table'>('cards');
	let selectedFilters = $state<string[]>([]);
	let selectionMode = $state(false);
	let selectedAssets = $state<Set<number>>(new Set());
	let showConfirmDelete = $state(false);
	let isBulkWorking = $state(false);

	// Reference data for bulk-edit dropdowns
	let analysisStatuses = $state<AnalysisStatusItem[]>([]);

	const COMPROMISE_STATUSES = [
		{ id: 1, name: 'Compromised' },
		{ id: 2, name: 'Not Compromised' },
		{ id: 3, name: 'Unknown' },
		{ id: 4, name: 'To be determined' }
	];

	let observer: IntersectionObserver | null = null;
	let loadMoreTrigger: HTMLDivElement | null = null;
	let scrollContainer: HTMLDivElement | null = null;

	const displayAssets = $derived(
		caseAssets.list.ids.map((id) => caseAssets.byId[id]).filter((a): a is Asset => !!a)
	);

	const selectedAssetId = $derived(page.params.asset_id ? Number(page.params.asset_id) : null);
	const selectedCount = $derived(selectedAssets.size);

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

			// After loading more, the trigger may STILL be inside the prefetch
			// margin (small per_page, tall viewport). The observer won't fire
			// again because intersection didn't change, so we manually re-check
			// and chain-load until the trigger is genuinely off-screen.
			requestAnimationFrame(() => {
				if (!loadMoreTrigger || !scrollContainer) return;
				if (caseAssets.list.nextPage === null) return;

				const rootRect = scrollContainer.getBoundingClientRect();
				const triggerRect = loadMoreTrigger.getBoundingClientRect();
				const prefetchPx = rootRect.height; // matches rootMargin below

				if (triggerRect.top < rootRect.bottom + prefetchPx) {
					loadMore();
				}
			});
		}
	};

	const setupObserver = () => {
		observer?.disconnect();

		// Prefetch one viewport ahead: the trigger fires while the user is
		// still scrolling, the next page loads in the background, and they
		// never see a stop-and-resume jank at the bottom edge.
		observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					loadMore();
				}
			},
			{
				root: scrollContainer,
				rootMargin: '100% 0px 100% 0px',
				threshold: 0
			}
		);

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

	const handleScrollContainerRef = (node: HTMLDivElement) => {
		scrollContainer = node;
		// Rebuild the observer once the scroll root is known — the previous
		// instance was attached to the viewport, which gives the wrong root
		// rect when the list itself scrolls inside a fixed-height panel.
		setupObserver();

		return {
			destroy: () => {
				scrollContainer = null;
			}
		};
	};

	const toggleAssetSelection = (assetId: number, e?: Event) => {
		e?.stopPropagation();
		if (selectedAssets.has(assetId)) {
			selectedAssets.delete(assetId);
		} else {
			selectedAssets.add(assetId);
		}
		selectedAssets = new Set(selectedAssets);
	};

	const selectAll = () => {
		selectedAssets = new Set(displayAssets.map((a) => a.asset_id));
	};

	const cancelSelect = () => {
		selectionMode = false;
		selectedAssets = new Set();
	};

	const deleteSelected = async () => {
		if (!selectedCount) {
			showConfirmDelete = false;
			return;
		}
		isBulkWorking = true;
		const ids = [...selectedAssets];
		await Promise.all(ids.map((id) => caseAssets.removeAsset(id)));
		isBulkWorking = false;
		showConfirmDelete = false;
		cancelSelect();
		await refreshAssets(1);
	};

	const setCompromiseStatus = async (statusId: number) => {
		if (!selectedCount) return;
		isBulkWorking = true;
		const ids = [...selectedAssets];
		await Promise.all(
			ids.map((id) => caseAssets.patchAsset(id, { asset_compromise_status_id: statusId }))
		);
		isBulkWorking = false;
		cancelSelect();
		await refreshAssets(caseAssets.list.currentPage);
	};

	const setAnalysisStatus = async (statusId: number) => {
		if (!selectedCount) return;
		isBulkWorking = true;
		const ids = [...selectedAssets];
		await Promise.all(ids.map((id) => caseAssets.patchAsset(id, { analysis_status_id: statusId })));
		isBulkWorking = false;
		cancelSelect();
		await refreshAssets(caseAssets.list.currentPage);
	};

	const openAsset = (assetId: number) =>
		goto(getAssetUrl(Number(page.params.case_id), String(assetId)));

	let showDownloadModal = $state(false);
	let isDownloading = $state(false);

	const downloadCountVisible = $derived(
		selectionMode && selectedAssets.size > 0 ? selectedAssets.size : displayAssets.length
	);
	const downloadCountAll = $derived(caseAssets.list.total);

	const handleDownloadConfirm = async (
		downloadType: 'visible' | 'all',
		selectedColumnKeys: Set<string>
	) => {
		isDownloading = true;

		try {
			const columns = AVAILABLE_EXPORT_COLUMNS.filter((c) => selectedColumnKeys.has(c.key));
			let rows: Asset[];

			if (downloadType === 'visible' && selectionMode && selectedAssets.size > 0) {
				rows = displayAssets.filter((a) => selectedAssets.has(a.asset_id));
			} else if (downloadType === 'visible') {
				rows = displayAssets;
			} else {
				const conditions = buildConditions();
				rows = [];
				let pageNumber = 1;
				let nextPage: number | null = 1;

				while (nextPage !== null) {
					const params: ListCaseAssetsParams = {
						page: pageNumber,
						per_page: 100,
						custom_conditions: conditions.length > 0 ? JSON.stringify(conditions) : undefined
					};
					const res = await CaseAssetsService.list(Number(page.params.case_id), params, { fetch });
					if (!res.ok || res.error || !res.data || typeof res.data === 'string') break;
					rows.push(...res.data.data);
					nextPage = res.data.next_page;
					pageNumber = nextPage ?? pageNumber;
				}
			}

			const csv = convertToCSV(rows, columns);
			const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `case-${page.params.case_id}-assets.csv`;
			link.click();
			URL.revokeObjectURL(url);
		} finally {
			isDownloading = false;
			showDownloadModal = false;
		}
	};

	onMount(async () => {
		await refreshAssets(1);
		setupObserver();

		const res = await AnalysisStatusService.list();
		if (res.ok && Array.isArray(res.data)) analysisStatuses = res.data;
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

<div class="flex h-full min-h-0 flex-col gap-2 p-2">
	<div class="flex items-center gap-2">
		<h2 class="text-lg font-semibold">Assets</h2>

		<div class="ml-auto flex items-center gap-2">
			{#if !selectionMode}
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger>
							<Button size="icon" variant="ghost" onclick={() => (selectionMode = true)}>
								<CheckSquareIcon size={16} />
							</Button>
						</TooltipTrigger>
						<TooltipContent align="center" side="bottom">Select</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			{/if}

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button
							size="icon"
							variant="ghost"
							onclick={() => {
								viewMode = 'table';
								// Card view appends pages into one growing list via
								// infinite scroll, so list.ids may hold N pages worth
								// of items. The table widget expects exactly one
								// server page of data at a time, so reset before
								// switching to avoid showing "page 6/6" with all
								// items rendered and broken pagination.
								refreshAssets(1);
							}}
						>
							<List size={16} />
						</Button>
					</TooltipTrigger>

					<TooltipContent align="center" side="bottom">Table View</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button
							size="icon"
							variant="ghost"
							onclick={() => {
								viewMode = 'cards';
								refreshAssets(1);
							}}
						>
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

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button size="icon" variant="ghost" onclick={() => (showDownloadModal = true)}>
							<DownloadCloudIcon size={16} />
						</Button>
					</TooltipTrigger>

					<TooltipContent align="center" side="bottom">Download as CSV</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	</div>

	{#if selectionMode}
		<div
			class="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/40 px-2 py-1.5"
		>
			<span class="text-xs text-muted-foreground">{selectedCount} selected</span>

			<Button size="xs" variant="outline" onclick={selectAll}>Select All</Button>

			<DropdownMenu>
				<DropdownMenuTrigger>
					<Button size="xs" variant="outline" disabled={!selectedCount || isBulkWorking}>
						Compromise <ChevronDownIcon size={12} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{#each COMPROMISE_STATUSES as s}
						<DropdownMenuItem onclick={() => setCompromiseStatus(s.id)}>{s.name}</DropdownMenuItem>
					{/each}
				</DropdownMenuContent>
			</DropdownMenu>

			<DropdownMenu>
				<DropdownMenuTrigger>
					<Button
						size="xs"
						variant="outline"
						disabled={!selectedCount || isBulkWorking || !analysisStatuses.length}
					>
						Analysis <ChevronDownIcon size={12} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start">
					{#each analysisStatuses as s}
						<DropdownMenuItem onclick={() => setAnalysisStatus(s.id)}>{s.name}</DropdownMenuItem>
					{/each}
				</DropdownMenuContent>
			</DropdownMenu>

			<Button
				size="xs"
				variant="destructive"
				disabled={!selectedCount || isBulkWorking}
				onclick={() => (showConfirmDelete = true)}
			>
				Delete
			</Button>

			<Button size="xs" variant="ghost" onclick={cancelSelect} class="ml-auto">Cancel</Button>
		</div>
	{/if}

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
				{selectionMode}
				{selectedAssets}
				onToggleSelect={toggleAssetSelection}
				on:pageChange={(e) => refreshAssets(e.detail.page)}
				on:pageSizeChange={(e) => {
					caseAssets.list.params.per_page = e.detail.pageSize;
					refreshAssets(1);
				}}
			/>
		{:else}
			<div
				use:handleScrollContainerRef
				data-testid="assets-scroll-container"
				class="-mx-2 flex h-full min-h-0 flex-col overflow-y-auto"
			>
				{#each displayAssets as asset (asset.asset_id)}
					<div
						role="button"
						tabindex="0"
						onclick={() => {
							if (selectionMode) {
								toggleAssetSelection(asset.asset_id);
							} else {
								openAsset(asset.asset_id);
							}
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();

								if (selectionMode) {
									toggleAssetSelection(asset.asset_id);
								} else {
									openAsset(asset.asset_id);
								}
							}
						}}
					>
						{#if selectionMode}
							<div class="flex items-center gap-2 px-2">
								<input
									type="checkbox"
									class="size-4 shrink-0 cursor-pointer accent-primary"
									checked={selectedAssets.has(asset.asset_id)}
									onclick={(e) => {
										e.stopPropagation();
										toggleAssetSelection(asset.asset_id);
									}}
									onchange={() => {}}
								/>
								<div class="min-w-0 flex-1">
									<AssetCard {asset} isSelected={selectedAssetId === asset.asset_id} />
								</div>
							</div>
						{:else}
							<AssetCard {asset} isSelected={selectedAssetId === asset.asset_id} />
						{/if}
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

<DownloadModal
	open={showDownloadModal}
	title="Download Assets as CSV"
	itemNounPlural="assets"
	availableColumns={AVAILABLE_EXPORT_COLUMNS}
	countVisible={downloadCountVisible}
	countAll={downloadCountAll}
	isProcessing={isDownloading}
	processingMessage="Fetching all assets…"
	onConfirm={handleDownloadConfirm}
	onOpenChange={(v) => (showDownloadModal = v)}
/>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Delete Assets"
	message="Delete {selectedCount} selected asset{selectedCount === 1
		? ''
		: 's'}? This cannot be undone."
	confirmText="Delete"
	onConfirm={deleteSelected}
/>

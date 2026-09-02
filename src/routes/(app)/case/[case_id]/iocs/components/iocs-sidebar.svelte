<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { RefreshCwIcon, List, Grid, DownloadCloudIcon, CheckSquareIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { CASE_IOCS_CTX, type CaseIocsContext } from '$lib/contexts/case-iocs.context.svelte';
	import { CaseIocsService, type ListCaseIocsParams } from '$lib/services/case-iocs.service';
	import type { Ioc } from '$lib/types/resources/ioc';
	import { Button } from '$lib/components/ui/button';
	import {
		AdvancedSearch,
		type SearchField,
		type SearchCondition
	} from '$lib/components/ui/advanced-search';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import IOCCard from '$lib/components/common/ioc/IOCCard.svelte';
	import IocDataTable from '$lib/components/common/ioc/IocDataTable.svelte';
	import { Tooltip, TooltipProvider, TooltipTrigger } from '$lib/components/ui/tooltip';
	import TooltipContent from '$lib/components/ui/tooltip/tooltip-content.svelte';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { ChevronDownIcon } from 'lucide-svelte';
	import { IocTypesService, type IocType } from '$lib/services/ioc-types.service';
	import DownloadModal from '$lib/components/common/DownloadModal.svelte';
	import { AVAILABLE_IOC_EXPORT_COLUMNS, convertIocsToCSV } from '$lib/utils/iocs.utils';

	const caseIocs = getContext<CaseIocsContext>(CASE_IOCS_CTX);

	let isLoading = $state(false);
	let isRefreshing = $state(false);
	let searchTerm = $state('');
	let searchConditions = $state<SearchCondition[]>([]);
	let searchDebounceTimer: number | undefined;

	let viewMode = $state<'cards' | 'table'>('cards');
	let selectedFilters = $state<string[]>([]);
	let selectionMode = $state(false);
	let selectedIocs = $state<Set<number>>(new Set());
	let showConfirmDelete = $state(false);
	let isBulkWorking = $state(false);

	// Reference data for bulk-edit dropdowns
	let iocTypes = $state<IocType[]>([]);

	let observer: IntersectionObserver | null = null;
	let loadMoreTrigger: HTMLDivElement | null = null;
	let scrollContainer: HTMLDivElement | null = null;

	const displayIocs = $derived(
		caseIocs.list.ids.map((id) => caseIocs.byId[id]).filter((ioc): ioc is Ioc => !!ioc)
	);

	const selectedIocId = $derived(page.params.ioc_id ? Number(page.params.ioc_id) : null);
	const selectedCount = $derived(selectedIocs.size);

	const filterOptions = [
		{
			id: 'analysis_done',
			label: 'Analysis Done',
			field: 'analysis_status_id',
			value: 6,
			operator: 'eq'
		},
		{
			id: 'analysis_started',
			label: 'Analysis Started',
			field: 'analysis_status_id',
			value: 3,
			operator: 'eq'
		},
		{
			id: 'analysis_todo',
			label: 'Analysis To Be Done',
			field: 'analysis_status_id',
			value: 2,
			operator: 'eq'
		}
	];

	const searchFields: SearchField[] = [
		{ key: 'ioc_value', label: 'IOC Value', type: 'text' },
		{ key: 'ioc_description', label: 'Description', type: 'text' },
		{ key: 'ioc_tags', label: 'Tags', type: 'text' },
		{ key: 'ioc_type.type_name', label: 'Type', type: 'text' },
		{ key: 'ioc_type_id', label: 'Type ID', type: 'number' },
		{ key: 'ioc_tlp_id', label: 'TLP ID', type: 'number' },
		{ key: 'ioc_id', label: 'IOC ID', type: 'number' }
	];

	const buildConditions = () => {
		const out: Array<{ field: string; operator: string; value: string | number }> = [];

		searchConditions.forEach((c) => {
			if (c.field === '_raw') {
				out.push(
					{ field: 'ioc_value', operator: 'like', value: c.value },
					{ field: 'ioc_description', operator: 'like', value: c.value },
					{ field: 'ioc_tags', operator: 'like', value: c.value },
					{ field: 'ioc_type.type_name', operator: 'like', value: c.value }
				);

				return;
			}

			out.push({ field: c.field, operator: c.operator, value: c.value });
		});

		if (searchTerm.trim() && searchConditions.length === 0) {
			out.push(
				{ field: 'ioc_value', operator: 'like', value: searchTerm.trim() },
				{ field: 'ioc_description', operator: 'like', value: searchTerm.trim() },
				{ field: 'ioc_tags', operator: 'like', value: searchTerm.trim() },
				{ field: 'ioc_type.type_name', operator: 'like', value: searchTerm.trim() }
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

	const refreshIocs = async (pageNumber = 1) => {
		if (isRefreshing) return;

		isRefreshing = true;

		try {
			const conditions = buildConditions();

			const params: ListCaseIocsParams = {
				page: pageNumber,
				per_page: caseIocs.list.params.per_page,
				custom_conditions: conditions.length > 0 ? JSON.stringify(conditions) : undefined
			};

			await caseIocs.listPaginated(params, { fetch });
		} finally {
			isRefreshing = false;
		}
	};

	const loadMore = async () => {
		if (caseIocs.list.nextPage === null || isLoading) return;

		isLoading = true;

		try {
			const previousIds = [...caseIocs.list.ids];

			await caseIocs.listPaginated(
				{
					page: caseIocs.list.currentPage + 1,
					per_page: caseIocs.list.params.per_page
				},
				{ fetch }
			);

			caseIocs.list.ids = [...new Set([...previousIds, ...caseIocs.list.ids])];
		} finally {
			isLoading = false;

			requestAnimationFrame(() => {
				if (!loadMoreTrigger || !scrollContainer) return;
				if (caseIocs.list.nextPage === null) return;

				const rootRect = scrollContainer.getBoundingClientRect();
				const triggerRect = loadMoreTrigger.getBoundingClientRect();
				const prefetchPx = rootRect.height;

				if (triggerRect.top < rootRect.bottom + prefetchPx) {
					loadMore();
				}
			});
		}
	};

	const setupObserver = () => {
		observer?.disconnect();

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
		setupObserver();

		return {
			destroy: () => {
				scrollContainer = null;
			}
		};
	};

	const toggleIocSelection = (iocId: number) => {
		if (selectedIocs.has(iocId)) {
			selectedIocs.delete(iocId);
		} else {
			selectedIocs.add(iocId);
		}
		selectedIocs = new Set(selectedIocs);
	};

	const selectAll = () => {
		selectedIocs = new Set(displayIocs.map((ioc) => ioc.ioc_id));
	};

	const cancelSelect = () => {
		selectionMode = false;
		selectedIocs = new Set();
	};

	const deleteSelected = async () => {
		if (!selectedCount) { showConfirmDelete = false; return; }
		isBulkWorking = true;
		const ids = [...selectedIocs];
		await Promise.all(ids.map((id) => caseIocs.removeIoc(id)));
		isBulkWorking = false;
		showConfirmDelete = false;
		cancelSelect();
		await refreshIocs(1);
	};

	const setIocType = async (typeId: number) => {
		if (!selectedCount) return;
		isBulkWorking = true;
		const ids = [...selectedIocs];
		await Promise.all(ids.map((id) => caseIocs.patchIoc(id, { ioc_type_id: typeId })));
		isBulkWorking = false;
		cancelSelect();
		await refreshIocs(caseIocs.list.currentPage);
	};

	const openIoc = (iocId: number) => goto(`/case/${page.params.case_id}/iocs/${iocId}`);

	let showDownloadModal = $state(false);
	let isDownloading = $state(false);

	const downloadCountVisible = $derived(
		selectionMode && selectedIocs.size > 0 ? selectedIocs.size : displayIocs.length
	);
	const downloadCountAll = $derived(caseIocs.list.total);

	const handleDownloadConfirm = async (
		downloadType: 'visible' | 'all',
		selectedColumnKeys: Set<string>
	) => {
		isDownloading = true;

		try {
			const columns = AVAILABLE_IOC_EXPORT_COLUMNS.filter((c) => selectedColumnKeys.has(c.key));
			let rows: Ioc[];

			if (downloadType === 'visible' && selectionMode && selectedIocs.size > 0) {
				rows = displayIocs.filter((ioc) => selectedIocs.has(ioc.ioc_id));
			} else if (downloadType === 'visible') {
				rows = displayIocs;
			} else {
				const conditions = buildConditions();
				rows = [];
				let pageNumber = 1;
				let nextPage: number | null = 1;

				while (nextPage !== null) {
					const params: ListCaseIocsParams = {
						page: pageNumber,
						per_page: 100,
						custom_conditions: conditions.length > 0 ? JSON.stringify(conditions) : undefined
					};
					const res = await CaseIocsService.list(Number(page.params.case_id), params, { fetch });
					if (!res.ok || res.error || !res.data || typeof res.data === 'string') break;
					rows.push(...res.data.data);
					nextPage = res.data.next_page;
					pageNumber = nextPage ?? pageNumber;
				}
			}

			const csv = convertIocsToCSV(rows, columns);
			const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `case-${page.params.case_id}-iocs.csv`;
			link.click();
			URL.revokeObjectURL(url);
		} finally {
			isDownloading = false;
			showDownloadModal = false;
		}
	};

	onMount(async () => {
		await refreshIocs(1);
		setupObserver();

		const res = await IocTypesService.list();
		if (res.ok && Array.isArray(res.data)) iocTypes = res.data;
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
			refreshIocs(1);
		}, 300);
	});

	$effect(() => {
		if (selectedIocId !== null) return;
		if (displayIocs.length === 0) return;

		const first = displayIocs[0];
		if (first) openIoc(first.ioc_id);
	});
</script>

<div class="flex h-full min-h-0 flex-col gap-2 p-2">
	<div class="flex items-center gap-2">
		<h2 class="text-lg font-semibold">Indicators</h2>

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
								// See assets-sidebar: card view accumulates pages via
								// infinite scroll; table view expects exactly one
								// server page at a time.
								refreshIocs(1);
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
								refreshIocs(1);
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
						<Button size="icon" variant="ghost" onclick={() => refreshIocs(1)}>
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
		<div class="flex flex-wrap items-center gap-2 rounded-md border border-border/50 bg-muted/40 px-2 py-1.5">
			<span class="text-xs text-muted-foreground">{selectedCount} selected</span>

			<Button size="xs" variant="outline" onclick={selectAll}>Select All</Button>

			<DropdownMenu>
				<DropdownMenuTrigger>
					<Button size="xs" variant="outline" disabled={!selectedCount || isBulkWorking || !iocTypes.length}>
						Set Type <ChevronDownIcon size={12} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" class="max-h-60 overflow-y-auto">
					{#each iocTypes as t}
						<DropdownMenuItem onclick={() => setIocType(t.type_id)}>{t.type_name}</DropdownMenuItem>
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
		placeholder="Search IOCs..."
		bind:value={searchTerm}
		bind:conditions={searchConditions}
		fields={searchFields}
	/>

	<div class="min-h-0 flex-1">
		{#if viewMode === 'table'}
			<IocDataTable
				className="h-full w-full"
				iocs={displayIocs}
				caseId={page.params.case_id}
				tablePage={caseIocs.list.currentPage}
				totalPages={caseIocs.list.lastPage}
				perPage={caseIocs.list.params.per_page}
				{selectionMode}
				{selectedIocs}
				onToggleSelect={toggleIocSelection}
				on:pageChange={(e) => refreshIocs(e.detail.page)}
				on:pageSizeChange={(e) => {
					caseIocs.list.params.per_page = e.detail.pageSize;
					refreshIocs(1);
				}}
			/>
		{:else}
			<div use:handleScrollContainerRef class="-mx-2 flex h-full min-h-0 flex-col overflow-y-auto">
				{#each displayIocs as ioc (ioc.ioc_id)}
					<div
						role="button"
						tabindex="0"
						onclick={() => {
							if (selectionMode) {
								toggleIocSelection(ioc.ioc_id);
							} else {
								openIoc(ioc.ioc_id);
							}
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();

								if (selectionMode) {
									toggleIocSelection(ioc.ioc_id);
								} else {
									openIoc(ioc.ioc_id);
								}
							}
						}}
					>
						{#if selectionMode}
							<div class="flex items-center gap-2 px-2">
								<input
									type="checkbox"
									class="size-4 shrink-0 cursor-pointer accent-primary"
									checked={selectedIocs.has(ioc.ioc_id)}
									onclick={(e) => { e.stopPropagation(); toggleIocSelection(ioc.ioc_id); }}
									onchange={() => {}}
								/>
								<div class="min-w-0 flex-1">
									<IOCCard {ioc} isSelected={selectedIocId === ioc.ioc_id} />
								</div>
							</div>
						{:else}
							<IOCCard {ioc} isSelected={selectedIocId === ioc.ioc_id} />
						{/if}
					</div>
				{/each}

				<div use:handleTriggerRef class="flex h-20 shrink-0 items-center justify-center">
					{#if isLoading}
						<Skeleton class="h-8 w-8 rounded-full" />
					{:else if caseIocs.list.nextPage !== null}
						<Button onclick={loadMore}>Load More</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<DownloadModal
	open={showDownloadModal}
	title="Download IOCs as CSV"
	itemNounPlural="IOCs"
	availableColumns={AVAILABLE_IOC_EXPORT_COLUMNS}
	countVisible={downloadCountVisible}
	countAll={downloadCountAll}
	isProcessing={isDownloading}
	processingMessage="Fetching all IOCs…"
	onConfirm={handleDownloadConfirm}
	onOpenChange={(v) => (showDownloadModal = v)}
/>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Delete IOCs"
	message="Delete {selectedCount} selected IOC{selectedCount === 1 ? '' : 's'}? This cannot be undone."
	confirmText="Delete"
	onConfirm={deleteSelected}
/>

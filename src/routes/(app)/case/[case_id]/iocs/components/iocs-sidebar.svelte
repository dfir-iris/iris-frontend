<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { RefreshCwIcon, List, Grid, DownloadCloudIcon } from 'lucide-svelte';
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

	const caseIocs = getContext<CaseIocsContext>(CASE_IOCS_CTX);

	let isLoading = $state(false);
	let isRefreshing = $state(false);
	let searchTerm = $state('');
	let searchConditions = $state<SearchCondition[]>([]);
	let searchDebounceTimer: number | undefined;

	let viewMode = $state<'cards' | 'table'>('cards');
	let selectedFilters = $state<string[]>([]);
	let selectionMode = $state(false);
	let selectedIocs = $state<Set<string>>(new Set());

	let observer: IntersectionObserver | null = null;
	let loadMoreTrigger: HTMLDivElement | null = null;

	const displayIocs = $derived(
		caseIocs.list.ids.map((id) => caseIocs.byId[id]).filter((ioc): ioc is Ioc => !!ioc)
	);

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
				{ field: 'ioc_type.type_name', operator: 'like', value: searchTerm.value }
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

	const toggleIocSelection = (iocId: string) => {
		if (selectedIocs.has(iocId)) {
			selectedIocs.delete(iocId);
		} else {
			selectedIocs.add(iocId);
		}

		selectedIocs = new Set(selectedIocs);
	};

	const openIoc = (iocId: number) => goto(`/case/${page.params.case_id}/iocs/${iocId}`);

	const csvEscape = (value: string | number | null | undefined) => {
		const text = value === null || value === undefined ? '' : String(value);

		return `"${text.replaceAll('"', '""')}"`;
	};

	const downloadCsv = async () => {
		const conditions = buildConditions();

		const rows: Ioc[] = [];
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

		const headers = ['ioc_value', 'ioc_type_name', 'ioc_description', 'ioc_tlp_name', 'ioc_tags'];

		const csv = [
			headers.join(','),
			...rows.map((ioc) =>
				[
					ioc.ioc_value,
					ioc.ioc_type?.type_name,
					ioc.ioc_description,
					ioc.tlp?.tlp_name,
					ioc.ioc_tags?.replaceAll(',', '|')
				]
					.map(csvEscape)
					.join(',')
			)
		].join('\n');

		const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');

		link.href = url;
		link.download = `case-${page.params.case_id}-iocs.csv`;
		link.click();

		URL.revokeObjectURL(url);
	};

	onMount(async () => {
		await refreshIocs(1);

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
			refreshIocs(1);
		}, 300);
	});
</script>

<div class="flex h-full min-h-0 flex-col gap-3 p-3">
	<div class="flex items-center gap-2">
		<h2 class="text-lg font-semibold">Indicators</h2>

		<div class="ml-auto flex items-center gap-2">
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button size="icon" variant="ghost" onclick={() => (viewMode = 'cards')}>
							<List size={16} />
						</Button>
					</TooltipTrigger>

					<TooltipContent align="center" side="bottom">List View</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger>
						<Button size="icon" variant="ghost" onclick={() => (viewMode = 'table')}>
							<Grid size={16} />
						</Button>
					</TooltipTrigger>

					<TooltipContent align="center" side="bottom">Grid View</TooltipContent>
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
						<Button size="icon" variant="ghost" onclick={() => downloadCsv()}>
							<DownloadCloudIcon size={16} />
						</Button>
					</TooltipTrigger>

					<TooltipContent align="center" side="bottom">Download as CSV</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		</div>
	</div>

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
				on:pageChange={(e) => refreshIocs(e.detail.page)}
			/>
		{:else}
			<div class="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
				{#each displayIocs as ioc (ioc.ioc_id)}
					<div
						role="button"
						tabindex="0"
						onclick={() => {
							if (selectionMode) {
								toggleIocSelection(ioc.ioc_id.toString());
							} else {
								openIoc(ioc.ioc_id);
							}
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();

								if (selectionMode) {
									toggleIocSelection(ioc.ioc_id.toString());
								} else {
									openIoc(ioc.ioc_id);
								}
							}
						}}
					>
						<IOCCard {ioc} />
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

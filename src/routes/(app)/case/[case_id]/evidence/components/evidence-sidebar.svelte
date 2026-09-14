<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { Grid, List, RefreshCwIcon, CheckSquareIcon, DownloadCloudIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		CASE_EVIDENCES_CTX,
		type CaseEvidencesContext
	} from '$lib/contexts/case-evidences.context.svelte';
	import {
		CaseEvidencesService,
		type ListCaseEvidencesParams
	} from '$lib/services/case-evidences.service';
	import type { Evidence, EvidenceType } from '$lib/types/resources/evidence';
	import DownloadModal from '$lib/components/common/DownloadModal.svelte';
	import {
		AVAILABLE_EVIDENCE_EXPORT_COLUMNS,
		convertEvidencesToCSV
	} from '$lib/utils/evidence.utils';
	import EvidenceCard from './evidence-card.svelte';
	import EvidenceDataTable from '$lib/components/common/evidence/EvidenceDataTable.svelte';
	import { Button } from '$lib/components/ui/button';
	import {
		AdvancedSearch,
		type SearchField,
		type SearchCondition
	} from '$lib/components/ui/advanced-search';
	import { Skeleton } from '$lib/components/ui/skeleton';
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
	import { EvidenceTypesService } from '$lib/services/evidence-types.service';

	const caseEvidences = getContext<CaseEvidencesContext>(CASE_EVIDENCES_CTX);

	let isLoading = $state(false);
	let isRefreshing = $state(false);
	let searchTerm = $state('');
	let searchConditions = $state<SearchCondition[]>([]);
	let viewMode = $state<'cards' | 'table'>('cards');

	let observer: IntersectionObserver | null = null;
	let loadMoreTrigger: HTMLDivElement | null = null;
	let scrollContainer: HTMLDivElement | null = null;

	let selectionMode = $state(false);
	let selectedEvidences = $state<Set<number>>(new Set());
	let showConfirmDelete = $state(false);
	let isBulkWorking = $state(false);

	// Reference data for bulk-edit dropdowns
	let evidenceTypes = $state<EvidenceType[]>([]);

	const searchFields: SearchField[] = [
		{ key: 'filename', label: 'Filename', type: 'text' },
		{ key: 'file_description', label: 'Description', type: 'text' },
		{ key: 'file_hash', label: 'Hash', type: 'text' },
		{ key: 'id', label: 'Evidence ID', type: 'number' }
	];

	const norm = (s: string | null | undefined) => (s ?? '').toLowerCase();

	const conditionMatchesEvidence = (evidence: Evidence, c: SearchCondition): boolean => {
		const q = c.value.toLowerCase();

		if (c.field === '_raw') {
			return (
				norm(evidence.filename).includes(q) ||
				norm(evidence.file_description).includes(q) ||
				norm(evidence.file_hash).includes(q)
			);
		}

		const fieldValue = (() => {
			switch (c.field) {
				case 'filename':
					return norm(evidence.filename);
				case 'file_description':
					return norm(evidence.file_description);
				case 'file_hash':
					return norm(evidence.file_hash);
				case 'id':
					return String(evidence.id);
				default:
					return '';
			}
		})();

		switch (c.operator) {
			case 'like':
				return fieldValue.includes(q);
			case 'eq':
				return fieldValue === q;
			case 'not':
				return fieldValue !== q;
			default:
				return true;
		}
	};

	const matchesEvidence = (
		evidence: Evidence,
		term: string,
		conditions: SearchCondition[]
	): boolean => {
		if (!term && conditions.length === 0) return true;

		if (conditions.length > 0) {
			return conditions.every((c) => conditionMatchesEvidence(evidence, c));
		}

		const q = term.toLowerCase();
		return (
			norm(evidence.filename).includes(q) ||
			norm(evidence.file_description).includes(q) ||
			norm(evidence.file_hash).includes(q)
		);
	};

	const displayEvidences = $derived(
		caseEvidences.list.ids
			.map((id) => caseEvidences.byId[id])
			.filter((e): e is Evidence => !!e)
			.filter((e) => matchesEvidence(e, searchTerm.trim(), searchConditions))
	);

	const selectedEvidenceId = $derived(
		page.params.evidence_id ? Number(page.params.evidence_id) : null
	);
	const selectedCount = $derived(selectedEvidences.size);

	const refreshEvidences = async (pageNumber = 1) => {
		if (isRefreshing) return;

		isRefreshing = true;

		try {
			const params: ListCaseEvidencesParams = {
				page: pageNumber,
				per_page: caseEvidences.list.params.per_page
			};
			await caseEvidences.listPaginated(params, { fetch });
		} finally {
			isRefreshing = false;
		}
	};

	const loadMore = async () => {
		if (caseEvidences.list.nextPage === null || isLoading) return;

		isLoading = true;

		try {
			const previousIds = [...caseEvidences.list.ids];
			await caseEvidences.listPaginated(
				{
					page: caseEvidences.list.currentPage + 1,
					per_page: caseEvidences.list.params.per_page
				},
				{ fetch }
			);
			caseEvidences.list.ids = [...new Set([...previousIds, ...caseEvidences.list.ids])];
		} finally {
			isLoading = false;

			requestAnimationFrame(() => {
				if (!loadMoreTrigger || !scrollContainer) return;
				if (caseEvidences.list.nextPage === null) return;

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
				if (entries[0]?.isIntersecting) loadMore();
			},
			{
				root: scrollContainer,
				rootMargin: '100% 0px 100% 0px',
				threshold: 0
			}
		);

		setTimeout(() => {
			if (loadMoreTrigger) observer?.observe(loadMoreTrigger);
		}, 0);
	};

	const handleTriggerRef = (node: HTMLDivElement) => {
		loadMoreTrigger = node;
		observer?.observe(node);

		return { destroy: () => observer?.unobserve(node) };
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

	const toggleEvidenceSelection = (evidenceId: number) => {
		if (selectedEvidences.has(evidenceId)) {
			selectedEvidences.delete(evidenceId);
		} else {
			selectedEvidences.add(evidenceId);
		}
		selectedEvidences = new Set(selectedEvidences);
	};

	const selectAll = () => {
		selectedEvidences = new Set(displayEvidences.map((e) => e.id));
	};

	const cancelSelect = () => {
		selectionMode = false;
		selectedEvidences = new Set();
	};

	const deleteSelected = async () => {
		if (!selectedCount) {
			showConfirmDelete = false;
			return;
		}
		isBulkWorking = true;
		const ids = [...selectedEvidences];
		await Promise.all(ids.map((id) => caseEvidences.removeEvidence(id)));
		isBulkWorking = false;
		showConfirmDelete = false;
		cancelSelect();
		await refreshEvidences(1);
	};

	const setEvidenceType = async (typeId: number) => {
		if (!selectedCount) return;
		isBulkWorking = true;
		const ids = [...selectedEvidences];
		await Promise.all(ids.map((id) => caseEvidences.patchEvidence(id, { type_id: typeId })));
		isBulkWorking = false;
		cancelSelect();
		await refreshEvidences(caseEvidences.list.currentPage);
	};

	const openEvidence = (evidenceId: number) =>
		goto(`/case/${page.params.case_id}/evidence/${evidenceId}`);

	let showDownloadModal = $state(false);
	let isDownloading = $state(false);

	const downloadCountVisible = $derived(
		selectionMode && selectedEvidences.size > 0 ? selectedEvidences.size : displayEvidences.length
	);
	const downloadCountAll = $derived(caseEvidences.list.total);

	const handleDownloadConfirm = async (
		downloadType: 'visible' | 'all',
		selectedColumnKeys: Set<string>
	) => {
		isDownloading = true;

		try {
			const columns = AVAILABLE_EVIDENCE_EXPORT_COLUMNS.filter((c) =>
				selectedColumnKeys.has(c.key)
			);
			let rows: Evidence[];

			if (downloadType === 'visible' && selectionMode && selectedEvidences.size > 0) {
				rows = displayEvidences.filter((e) => selectedEvidences.has(e.id));
			} else if (downloadType === 'visible') {
				rows = displayEvidences;
			} else {
				rows = [];
				let pageNumber = 1;
				let nextPage: number | null = 1;

				while (nextPage !== null) {
					const params: ListCaseEvidencesParams = { page: pageNumber, per_page: 100 };
					const res = await CaseEvidencesService.list(Number(page.params.case_id), params, {
						fetch
					});
					if (!res.ok || res.error || !res.data || typeof res.data === 'string') break;
					rows.push(...res.data.data);
					nextPage = res.data.next_page;
					pageNumber = nextPage ?? pageNumber;
				}
			}

			const csv = convertEvidencesToCSV(rows, columns);
			const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = `case-${page.params.case_id}-evidence.csv`;
			link.click();
			URL.revokeObjectURL(url);
		} finally {
			isDownloading = false;
			showDownloadModal = false;
		}
	};

	onMount(async () => {
		await refreshEvidences(1);
		setupObserver();

		const res = await EvidenceTypesService.list();
		if (res.ok && Array.isArray(res.data)) evidenceTypes = res.data;
	});

	onDestroy(() => {
		observer?.disconnect();
	});

	$effect(() => {
		if (selectedEvidenceId !== null) return;
		if (displayEvidences.length === 0) return;

		const first = displayEvidences[0];
		if (first) openEvidence(first.id);
	});
</script>

<div class="flex h-full min-h-0 flex-col gap-2 p-2">
	<div class="flex items-center gap-2">
		<h2 class="text-lg font-semibold">Evidence</h2>

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
								// Card view accumulates pages via infinite scroll;
								// table view expects exactly one server page at a time.
								refreshEvidences(1);
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
								refreshEvidences(1);
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
						<Button size="icon" variant="ghost" onclick={() => refreshEvidences(1)}>
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
					<Button
						size="xs"
						variant="outline"
						disabled={!selectedCount || isBulkWorking || !evidenceTypes.length}
					>
						Set Type <ChevronDownIcon size={12} />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="start" class="max-h-60 overflow-y-auto">
					{#each evidenceTypes as t}
						<DropdownMenuItem onclick={() => setEvidenceType(t.id)}>{t.name}</DropdownMenuItem>
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
		placeholder="Search evidence..."
		bind:value={searchTerm}
		bind:conditions={searchConditions}
		fields={searchFields}
	/>

	<div class="min-h-0 flex-1">
		{#if viewMode === 'table'}
			<EvidenceDataTable
				className="h-full w-full"
				evidences={displayEvidences}
				caseId={page.params.case_id}
				tablePage={caseEvidences.list.currentPage}
				totalPages={caseEvidences.list.lastPage}
				perPage={caseEvidences.list.params.per_page}
				{selectionMode}
				{selectedEvidences}
				onToggleSelect={toggleEvidenceSelection}
				on:pageChange={(e) => refreshEvidences(e.detail.page)}
				on:pageSizeChange={(e) => {
					caseEvidences.list.params.per_page = e.detail.pageSize;
					refreshEvidences(1);
				}}
			/>
		{:else}
			<div use:handleScrollContainerRef class="-mx-2 flex h-full min-h-0 flex-col overflow-y-auto">
				{#each displayEvidences as evidence (evidence.id)}
					<div
						role="button"
						tabindex="0"
						onclick={() => {
							if (selectionMode) {
								toggleEvidenceSelection(evidence.id);
							} else {
								openEvidence(evidence.id);
							}
						}}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								if (selectionMode) {
									toggleEvidenceSelection(evidence.id);
								} else {
									openEvidence(evidence.id);
								}
							}
						}}
					>
						{#if selectionMode}
							<div class="flex items-center gap-2 px-2">
								<input
									type="checkbox"
									class="size-4 shrink-0 cursor-pointer accent-primary"
									checked={selectedEvidences.has(evidence.id)}
									onclick={(e) => {
										e.stopPropagation();
										toggleEvidenceSelection(evidence.id);
									}}
									onchange={() => {}}
								/>
								<div class="min-w-0 flex-1">
									<EvidenceCard {evidence} isSelected={selectedEvidenceId === evidence.id} />
								</div>
							</div>
						{:else}
							<EvidenceCard {evidence} isSelected={selectedEvidenceId === evidence.id} />
						{/if}
					</div>
				{/each}

				<div use:handleTriggerRef class="flex h-20 shrink-0 items-center justify-center">
					{#if isLoading}
						<Skeleton class="h-8 w-8 rounded-full" />
					{:else if caseEvidences.list.nextPage !== null}
						<Button onclick={loadMore}>Load More</Button>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

<DownloadModal
	open={showDownloadModal}
	title="Download Evidence as CSV"
	itemNounPlural="evidence items"
	availableColumns={AVAILABLE_EVIDENCE_EXPORT_COLUMNS}
	countVisible={downloadCountVisible}
	countAll={downloadCountAll}
	isProcessing={isDownloading}
	processingMessage="Fetching all evidence…"
	onConfirm={handleDownloadConfirm}
	onOpenChange={(v) => (showDownloadModal = v)}
/>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Delete Evidence"
	message="Delete {selectedCount} selected evidence item{selectedCount === 1
		? ''
		: 's'}? This cannot be undone."
	confirmText="Delete"
	onConfirm={deleteSelected}
/>

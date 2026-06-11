<script lang="ts">
	import { getContext, onMount, onDestroy } from 'svelte';
	import { Grid, List, RefreshCwIcon } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		CASE_EVIDENCES_CTX,
		type CaseEvidencesContext
	} from '$lib/contexts/case-evidences.context.svelte';
	import type { ListCaseEvidencesParams } from '$lib/services/case-evidences.service';
	import type { Evidence } from '$lib/types/resources/evidence';
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

	const caseEvidences = getContext<CaseEvidencesContext>(CASE_EVIDENCES_CTX);

	let isLoading = $state(false);
	let isRefreshing = $state(false);
	let searchTerm = $state('');
	let searchConditions = $state<SearchCondition[]>([]);
	let viewMode = $state<'cards' | 'table'>('cards');

	let observer: IntersectionObserver | null = null;
	let loadMoreTrigger: HTMLDivElement | null = null;
	let scrollContainer: HTMLDivElement | null = null;

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

	const openEvidence = (evidenceId: number) =>
		goto(`/case/${page.params.case_id}/evidence/${evidenceId}`);

	onMount(async () => {
		await refreshEvidences(1);
		setupObserver();
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

<div class="flex h-full min-h-0 flex-col gap-3 p-3">
	<div class="flex items-center gap-2">
		<h2 class="text-lg font-semibold">Evidence</h2>

		<div class="ml-auto flex items-center gap-2">
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
		</div>
	</div>

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
				on:pageChange={(e) => refreshEvidences(e.detail.page)}
				on:pageSizeChange={(e) => {
					caseEvidences.list.params.per_page = e.detail.pageSize;
					refreshEvidences(1);
				}}
			/>
		{:else}
			<div
				use:handleScrollContainerRef
				class="flex h-full min-h-0 flex-col gap-2 overflow-y-auto pr-1"
			>
				{#each displayEvidences as evidence (evidence.id)}
					<div
						role="button"
						tabindex="0"
						onclick={() => openEvidence(evidence.id)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								openEvidence(evidence.id);
							}
						}}
					>
						<EvidenceCard {evidence} isSelected={selectedEvidenceId === evidence.id} />
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

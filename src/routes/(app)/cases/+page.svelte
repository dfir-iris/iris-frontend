<script lang="ts">
	import { PlusIcon } from 'lucide-svelte';
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import type { Case, Tags } from '$lib/types/resources/case';
	import type { RequestResponse, Paginated } from '$lib/services/api.service';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import { DEFAULT_DEBOUNCE, DEFAULT_ITEMS_PER_PAGE } from '$lib/config/api.config';
	import {
		CaseFilters,
		type FilterDef,
		type FilterLogic,
		type FilterRow
	} from '$lib/components/common/CaseFilters';
	import CasesDataTable from '$lib/components/common/cases-data-table.svelte';
	import { Button } from '$lib/components/ui/button';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import { Select } from '$lib/components/ui/select';
	import SelectTrigger from '$lib/components/ui/select/select-trigger.svelte';
	import SelectContent from '$lib/components/ui/select/select-content.svelte';
	import SelectItem from '$lib/components/ui/select/select-item.svelte';

	const cases = getContext<CasesContext>(CASES_CTX);

	let search = $state('');
	let showClosed = $state(false);
	let currentPage = $state(1);
	let perPage = $state(DEFAULT_ITEMS_PER_PAGE);

	let filterLogic = $state<FilterLogic>('and');
	let filters = $state<FilterRow[]>([]);

	let casesPaginated = $state<Promise<RequestResponse<Paginated<Case>>> | null>(null);

	const perPageOptions = [5, 10, 25, 50, 100].map((n) => ({
		value: String(n),
		label: `${n} entries`
	}));

	const filterDefs: FilterDef<Case>[] = [
		{ id: 'outcome', label: 'Outcome', get: (c) => (c as Case).closing_note ?? '' },
		{ id: 'case_id', label: 'Case ID', get: (c) => (c as Case).case_id },
		{ id: 'severity', label: 'Severity', get: (c) => (c as Case).severity?.severity_name ?? '' },
		{ id: 'title', label: 'Title', get: (c) => (c as Case).case_name },
		{
			id: 'customer',
			label: 'Customer',
			get: (c) => (c as Case).case_customer?.customer_name ?? ''
		},
		{
			id: 'classification',
			label: 'Classification',
			get: (c) =>
				(c as Case).classification_id === null ? '' : String((c as Case).classification_id)
		},
		{ id: 'state', label: 'State', get: (c) => (c as Case).state?.state_name ?? '' },
		{
			id: 'tags',
			label: 'Tags',
			get: (c) => (c as Case).tags?.map((t) => (t as Tags).tag_title).join(', ') ?? ''
		},
		{
			id: 'open_since',
			label: 'Open since',
			get: (c) => (c as Case).open_date ?? ''
		},
		{
			id: 'open_date',
			label: 'Open date',
			get: (c) => (c as Case).open_date ?? ''
		},
		{
			id: 'tasks',
			label: 'Tasks',
			get: () => ''
		},
		{ id: 'owner', label: 'Owner', get: (c) => (c as Case).owner?.user_login ?? '' }
	];

	const updateUrl = (params: { search?: string; page?: number; showClosed?: boolean }) => {
		const url = new URL(page.url);

		if (params.search !== undefined) {
			const s = params.search.trim();
			if (s === '') url.searchParams.delete('search');
			else url.searchParams.set('search', s);
		}

		if (params.page !== undefined) {
			if (params.page <= 1) url.searchParams.delete('page');
			else url.searchParams.set('page', String(params.page));
		}

		if (params.showClosed !== undefined) {
			if (params.showClosed) url.searchParams.set('show_closed', '1');
			else url.searchParams.delete('show_closed');
		}

		const nextHref = `${url.pathname}${url.search}`;
		const curHref = `${page.url.pathname}${page.url.search}`;
		if (nextHref === curHref) return;

		void goto(nextHref, { replaceState: true, keepFocus: true, noScroll: true });
	};

	let filtersDebounce: ReturnType<typeof setTimeout> | null = null;
	let debouncedLogic = $state<FilterLogic>('and');
	let debouncedFilters = $state<FilterRow[]>([]);

	const effectiveFilters = (rows: FilterRow[]) =>
		rows.filter((r) => {
			const op = (r.operation ?? '').toLowerCase();
			if (op === 'empty' || op === 'not_empty') return true;
			return (r.value ?? '').trim() !== '';
		});

	$effect(() => {
		const l = filterLogic;
		const f = filters;

		if (filtersDebounce) clearTimeout(filtersDebounce);

		filtersDebounce = setTimeout(() => {
			debouncedLogic = l;
			debouncedFilters = f;
			currentPage = 1;
			updateUrl({ page: 1 });
		}, DEFAULT_DEBOUNCE);
	});

	const normalizeCase = (value: unknown): Case => {
		if (!value || typeof value !== 'object') return {} as Case;

		const raw = value as Record<string, unknown>;

		const normalized: Record<string, unknown> = { ...raw };

		const name = raw.name;
		if (normalized.case_name === undefined && typeof name === 'string') {
			normalized.case_name = name;
		}

		const description = raw.description;
		if (normalized.case_description === undefined && typeof description === 'string') {
			normalized.case_description = description;
		}

		const socId = raw.soc_id;
		if (normalized.case_soc_id === undefined && typeof socId === 'string') {
			normalized.case_soc_id = socId;
		}

		const client = raw.client;
		if (normalized.case_customer === undefined && client && typeof client === 'object') {
			normalized.case_customer = client;
		}

		return normalized as unknown as Case;
	};

	$effect(() => {
		const urlSearch = page.url.searchParams.get('search') ?? '';
		const urlPage = Number(page.url.searchParams.get('page') ?? '1') || 1;
		const urlShowClosed = page.url.searchParams.get('show_closed') === '1';

		search = urlSearch;
		currentPage = urlPage;
		showClosed = urlShowClosed;

		const activeFilters = effectiveFilters(debouncedFilters);

		const baseParams: Record<string, unknown> = {
			page: urlPage,
			per_page: Number(perPage),
			case_name: urlSearch.trim() === '' ? undefined : urlSearch.trim(),
			logic: debouncedLogic,
			filters: activeFilters.length === 0 ? undefined : JSON.stringify(activeFilters)
		};

		const params = urlShowClosed ? baseParams : { ...baseParams, is_open: true };

		const p = cases.filterPaginated(params);

		casesPaginated = p.then((res) => {
			const raw = res.data;

			if (!raw || typeof raw !== 'object' || typeof raw === 'string') {
				const empty: Paginated<Case> = {
					data: [] as Case[],
					total: 0,
					current_page: urlPage,
					last_page: 1,
					next_page: null
				};

				return {
					...res,
					ok: false,
					data: empty
				};
			}

			const pageData = raw as Paginated<Case>;
			const list = Array.isArray(pageData.data) ? pageData.data : ([] as Case[]);

			return {
				...res,
				data: {
					...pageData,
					data: list.map(normalizeCase)
				}
			};
		});
	});

	let didInitSearch = false;
	let searchDebounce: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const searchParam = search;

		if (!didInitSearch) {
			didInitSearch = true;
			return;
		}

		if (searchDebounce) clearTimeout(searchDebounce);

		searchDebounce = setTimeout(() => {
			updateUrl({ search: searchParam, page: 1 });
		}, DEFAULT_DEBOUNCE);
	});
</script>

<svelte:head>
	<title>Cases | DFIR-IRIS</title>
</svelte:head>

<div class="flex grow flex-col gap-4 p-4">
	<div class="flex flex-row items-center gap-4">
		<h1>{showClosed ? 'All Cases' : 'Open Cases'}</h1>

		<div class="ml-auto"></div>

		<div class="flex items-center space-x-2 rounded p-1 hover:bg-muted/50">
			<Checkbox
				id="show_closed"
				checked={showClosed}
				onCheckedChange={(checked) => updateUrl({ showClosed: checked === true, page: 1 })}
			/>

			<Label for="show_closed" class="w-full cursor-pointer text-sm font-normal">
				Show closed cases
			</Label>
		</div>

		<Button onclick={() => (cases.ui.showAddModal = true)}>
			<PlusIcon />
			Open Case
		</Button>
	</div>

	<div class="flex justify-between">
		<div class="">
			<CaseFilters
				defs={filterDefs}
				logic={filterLogic}
				{filters}
				onLogicChange={(l) => (filterLogic = l)}
				onFiltersChange={(f) => {
					filters = f;
					currentPage = 1;
					updateUrl({ page: 1 });
				}}
			/>
		</div>

		<div class="flex gap-2">
			<div class="flex min-w-48">
				<Searchbar placeholder="Search cases" bind:value={search} />
			</div>

			<Select
				value={String(perPage)}
				onValueChange={(value) => {
					perPage = Number(value);
					currentPage = 1;
					updateUrl({ page: 1 });
				}}
				type="single"
			>
				<SelectTrigger>{perPage} entries per page</SelectTrigger>

				<SelectContent>
					{#each perPageOptions as perPageOption}
						<SelectItem value={perPageOption.value}>{perPageOption.label}</SelectItem>
					{/each}
				</SelectContent>
			</Select>
		</div>
	</div>

	{#if casesPaginated}
		<CasesDataTable
			class="flex grow"
			cases={casesPaginated}
			page={currentPage}
			onPageChange={(page) => updateUrl({ page })}
		/>
	{/if}
</div>

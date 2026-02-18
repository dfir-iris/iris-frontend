<script lang="ts">
	import { PlusIcon } from 'lucide-svelte';
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import Label from '$lib/components/ui/label/label.svelte';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import {
		applyFilters,
		CaseFilters,
		type FilterDef,
		type FilterLogic,
		type FilterRow
	} from '$lib/components/common/CaseFilters';
	import CasesDataTable from '$lib/components/common/cases-data-table.svelte';
	import type { Case, Tags } from '$lib/types/resources/case';
	import type { RequestResponse, Paginated } from '$lib/services/api.service';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import { Select } from '$lib/components/ui/select';
	import SelectTrigger from '$lib/components/ui/select/select-trigger.svelte';
	import SelectContent from '$lib/components/ui/select/select-content.svelte';
	import SelectItem from '$lib/components/ui/select/select-item.svelte';
	import type { ListCasesParams } from '$lib/services/case.service';

	const DEFAULT_ITEMS_PER_PAGE = 25;

	const cases = getContext<CasesContext>(CASES_CTX);

	let search = $state('');
	let showClosed = $state(false);
	let currentPage = $state(1);
	let perPage = $state(DEFAULT_ITEMS_PER_PAGE);

	let filterLogic = $state<FilterLogic>('and');
	let filters = $state<FilterRow[]>([]);

	let casesBase = $state<Promise<RequestResponse<Paginated<Case>>> | null>(null);
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

	$effect(() => {
		const urlSearch = page.url.searchParams.get('search') ?? '';
		const urlPage = Number(page.url.searchParams.get('page') ?? '1') || 1;
		const urlShowClosed = page.url.searchParams.get('show_closed') === '1';

		search = urlSearch;
		currentPage = urlPage;
		showClosed = urlShowClosed;

		const params: ListCasesParams = {
			page: urlPage,
			per_page: Number(perPage),
			case_name: urlSearch.trim() === '' ? undefined : urlSearch.trim(),
			is_open: urlShowClosed ? undefined : true
		};

		casesBase = cases.listPaginated(params);
	});

	$effect(() => {
		const base = casesBase;
		const f = filters;
		const l = filterLogic;

		if (!base) {
			casesPaginated = null;
			return;
		}

		casesPaginated = base.then((res) => {
			if (!res.ok || !res.data || typeof res.data === 'string') return res;

			const filtered = applyFilters(res.data.data, filterDefs, f, l);

			return {
				...res,
				data: {
					...res.data,
					data: filtered
				}
			};
		});
	});

	let didInitSearch = false;
	let debounce: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const searchParam = search;

		if (!didInitSearch) {
			didInitSearch = true;
			return;
		}

		if (debounce) clearTimeout(debounce);

		debounce = setTimeout(() => {
			updateUrl({ search: searchParam, page: 1 });
		}, 250);
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

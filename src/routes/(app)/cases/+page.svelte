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
		CaseSavedFiltersBar,
		emptyGroup,
		pruneTree,
		treeHasActiveCondition,
		type FilterDef,
		type FilterGroup,
		type FilterLogic,
		type FilterRow
	} from '$lib/components/common/CaseFilters';
	import CasesDataTable from '$lib/components/common/cases-data-table.svelte';
	import { UsersService, type User } from '$lib/services/users.service';
	import { CustomersService, type Customer } from '$lib/services/customers.service';
	import { CaseStatesService, type CaseState } from '$lib/services/case-states.service';
	import { SeveritiesService, type Severity } from '$lib/services/severities.service';
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

	// Recursive filter tree. Root group always exists; sub-groups
	// (`{ logic, items }`) can be added inside it for queries shaped
	// like `(A AND B) OR (C AND D)`.
	let filterGroup = $state<FilterGroup>(emptyGroup('and'));
	let filterBuilderOpen = $state(false);

	let selectedSavedFilterId = $state('');
	let savingFilter = $state(false);

	// Sort is now driven server-side via `order_by` + `direction` so
	// pagination + sort stay in sync. The data-table reports column
	// header clicks through `sort` / `onSortChange`; we translate the
	// column id to the backend column name in `serverOrderBy()`.
	type SortState = { id: string; dir: 'asc' | 'desc' | null } | null;
	let sort = $state<SortState>({ id: 'open_date', dir: 'desc' });

	let casesPaginated = $state<Promise<RequestResponse<Paginated<Case>>> | null>(null);

	// Lookups feeding the prefilled value pickers in the filter builder.
	// Loaded once on mount; the backend filters match these by *name*
	// (not id) so the picker emits the textual value the backend
	// already compares against (see manage_cases_db.build_filter_case_query).
	let userOptions = $state<{ value: string; label: string }[]>([]);
	let customerOptions = $state<{ value: string; label: string }[]>([]);
	let stateOptions = $state<{ value: string; label: string }[]>([]);
	let severityOptions = $state<{ value: string; label: string }[]>([]);

	const perPageOptions = [5, 10, 25, 50, 100].map((n) => ({
		value: String(n),
		label: `${n} entries`
	}));

	// Filter definitions for the cases overview. `valueOptions` turns
	// the value input into a prefilled picker for low-cardinality
	// fields — derived so the dropdown updates as the lookup arrays
	// load. Backend matches these by the textual value (state_name,
	// severity_name, customer name, user login), so the picker emits
	// strings that the backend can compare directly.
	const filterDefs = $derived<FilterDef<Case>[]>([
		{ id: 'title', label: 'Title', get: (c) => (c as Case).case_name },
		{ id: 'case_id', label: 'Case ID', get: (c) => (c as Case).case_id },
		{ id: 'outcome', label: 'Outcome', get: (c) => (c as Case).closing_note ?? '' },
		{
			id: 'severity',
			label: 'Severity',
			get: (c) => (c as Case).severity?.severity_name ?? '',
			valueOptions: severityOptions
		},
		{
			id: 'customer',
			label: 'Customer',
			get: (c) => (c as Case).case_customer?.customer_name ?? '',
			valueOptions: customerOptions
		},
		{
			id: 'classification',
			label: 'Classification',
			get: (c) =>
				(c as Case).classification_id === null ? '' : String((c as Case).classification_id)
		},
		{
			id: 'state',
			label: 'State',
			get: (c) => (c as Case).state?.state_name ?? '',
			valueOptions: stateOptions
		},
		{
			id: 'tags',
			label: 'Tags',
			get: (c) => (c as Case).tags?.map((t) => (t as Tags).tag_title).join(', ') ?? ''
		},
		{ id: 'open_date', label: 'Open date', get: (c) => (c as Case).open_date ?? '' },
		{
			id: 'owner',
			label: 'Owner',
			get: (c) => (c as Case).owner?.user_login ?? '',
			valueOptions: userOptions
		}
	]);

	// Column id → backend `order_by` column. The backend's
	// `build_filter_case_query` special-cases `owner`, `opened_by`,
	// `customer_name`, `state`; everything else must match a `Cases`
	// model attribute. Anything not in this map falls through to no
	// sort.
	const serverOrderBy = (columnId: string): string | null => {
		switch (columnId) {
			case 'case_name':
				return 'name';
			case 'case_soc_id':
				return 'soc_id';
			case 'open_date':
				return 'open_date';
			case 'close_date':
				return 'close_date';
			case 'case_customer.customer_name':
				return 'customer_name';
			case 'state.state_name':
				return 'state';
			case 'severity.severity_name':
				return 'severity_id';
			case 'owner.user_login':
				return 'owner';
			default:
				return null;
		}
	};

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
	let debouncedGroup = $state<FilterGroup>(emptyGroup('and'));

	// Apply runs the filter set immediately (also called when the user
	// presses Enter inside a value input). Without it, filter changes
	// took ~DEFAULT_DEBOUNCE before reaching the server which felt
	// laggy.
	const applyFiltersNow = () => {
		if (filtersDebounce) clearTimeout(filtersDebounce);
		debouncedGroup = filterGroup;
		currentPage = 1;
		updateUrl({ page: 1 });
	};

	$effect(() => {
		const g = filterGroup;

		if (filtersDebounce) clearTimeout(filtersDebounce);

		filtersDebounce = setTimeout(() => {
			debouncedGroup = g;
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

		// Send the trimmed filter tree so empty rows / empty
		// sub-groups don't cost a round-trip. If nothing is active
		// after pruning, omit `filters` entirely so the server isn't
		// forced to parse a no-op tree.
		const pruned = pruneTree(debouncedGroup);
		const hasFilters = treeHasActiveCondition(pruned);

		const orderBy = sort?.id ? serverOrderBy(sort.id) : null;
		const direction = sort?.dir ?? null;

		const baseParams: Record<string, unknown> = {
			page: urlPage,
			per_page: Number(perPage),
			case_name: urlSearch.trim() === '' ? undefined : urlSearch.trim(),
			logic: pruned.logic,
			filters: hasFilters ? JSON.stringify(pruned) : undefined,
			order_by: orderBy ?? undefined,
			direction: orderBy && direction ? direction : undefined
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

	// Saved filters ----------------------------------------------------

	$effect(() => {
		void cases.loadSavedFilters();
	});

	// Lookup loaders --------------------------------------------------

	const loadLookups = async () => {
		// Run in parallel; failures degrade the picker to a free-text
		// input rather than blocking the page.
		const [usersRes, customersRes, statesRes, severitiesRes] = await Promise.all([
			UsersService.list(),
			CustomersService.list(),
			CaseStatesService.list(),
			SeveritiesService.list()
		]);

		// users response is a Paginated<User>, customers / states /
		// severities are flat arrays.
		const usersData = usersRes.data as { data?: User[] } | User[] | null;
		const users: User[] = Array.isArray(usersData) ? usersData : (usersData?.data ?? []);
		userOptions = users.map((u) => ({
			value: u.user_login,
			label: u.user_name ? `${u.user_name} (${u.user_login})` : u.user_login
		}));

		const customers = Array.isArray(customersRes.data) ? (customersRes.data as Customer[]) : [];
		customerOptions = customers.map((c) => ({ value: c.customer_name, label: c.customer_name }));

		const states = Array.isArray(statesRes.data) ? (statesRes.data as CaseState[]) : [];
		stateOptions = states.map((s) => ({ value: s.state_name, label: s.state_name }));

		const severities = Array.isArray(severitiesRes.data) ? (severitiesRes.data as Severity[]) : [];
		severityOptions = severities.map((s) => ({ value: s.severity_name, label: s.severity_name }));
	};

	$effect(() => {
		void loadLookups();
	});

	// Saved-filter payload — versioned shape so we can keep reading
	// pre-nesting presets a user already saved. The legacy shape was
	// `{ logic, filters: FilterRow[] }`; the new shape is
	// `{ group: FilterGroup }`. The reader normalises both into a
	// FilterGroup before applying.
	type LegacySavedFilterPayload = {
		logic?: FilterLogic;
		filters?: FilterRow[];
		showClosed?: boolean;
		search?: string;
	};
	type SavedFilterPayload = {
		group?: FilterGroup;
		showClosed?: boolean;
		search?: string;
	} & LegacySavedFilterPayload;

	const normalisePayload = (data: SavedFilterPayload | null): FilterGroup => {
		if (!data) return emptyGroup('and');
		if (data.group && Array.isArray(data.group.items)) return data.group;
		const legacy = (data.filters ?? []) as FilterRow[];
		return { logic: data.logic ?? 'and', items: legacy };
	};

	const applySavedFilter = async (id: number) => {
		const saved = await cases.getSavedFilter(id);
		if (!saved) return;
		const data = saved.filter_data as SavedFilterPayload | null;

		selectedSavedFilterId = String(id);
		filterGroup = normalisePayload(data);
		showClosed = !!data?.showClosed;
		search = data?.search ?? '';
		applyFiltersNow();
		updateUrl({ showClosed, search, page: 1 });
	};

	const clearActiveFilter = () => {
		selectedSavedFilterId = '';
		filterGroup = emptyGroup('and');
		applyFiltersNow();
	};

	const deleteSavedFilter = async (id: number) => {
		await cases.removeSavedFilter(id);
		if (selectedSavedFilterId === String(id)) selectedSavedFilterId = '';
	};

	const saveCurrentFilter = async (meta: { name: string; description: string; isPrivate: boolean }) => {
		if (savingFilter) return;
		savingFilter = true;

		const payload: SavedFilterPayload = {
			group: pruneTree(filterGroup),
			showClosed,
			search: search.trim() || undefined
		};

		const created = await cases.createSavedFilter({
			filter_is_private: meta.isPrivate,
			filter_name: meta.name,
			filter_description: meta.description,
			filter_data: payload
		});

		savingFilter = false;
		if (created) selectedSavedFilterId = String(created.filter_id);
	};

	const hasActiveFilter = $derived(
		treeHasActiveCondition(filterGroup) || search.trim() !== '' || showClosed
	);
</script>

<svelte:head>
	<title>Cases</title>
</svelte:head>

<!--
  Outer container is height-bounded so the table can scroll on its
  own (`min-h-0 overflow-hidden`). Only the table region scrolls — the
  page header and filter strip stay pinned, matching the alerts list
  layout.
-->
<div class="flex h-full min-h-0 grow flex-col gap-4 overflow-hidden p-4">
	<div class="flex shrink-0 flex-row items-center gap-4">
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

	<div class="flex shrink-0 flex-wrap items-center justify-between gap-2">
		<div class="flex items-center gap-2">
			<Button
				variant={filterBuilderOpen ? 'default' : 'outline'}
				size="sm"
				onclick={() => (filterBuilderOpen = !filterBuilderOpen)}
			>
				{filterBuilderOpen ? 'Hide filter' : 'Build filter'}
				{#if hasActiveFilter}
					<span class="ml-1 size-2 rounded-full bg-primary-foreground/80"></span>
				{/if}
			</Button>

			<CaseSavedFiltersBar
				presets={cases.savedFilters.items}
				selectedId={selectedSavedFilterId}
				hasActiveFilter={hasActiveFilter}
				saving={savingFilter}
				onSelect={(id) => applySavedFilter(id)}
				onClear={clearActiveFilter}
				onDelete={(id) => deleteSavedFilter(id)}
				onSave={(meta) => saveCurrentFilter(meta)}
			/>
		</div>

		<div class="flex items-center gap-2">
			<div class="flex min-w-48">
				<Searchbar placeholder="Search cases" bind:value={search} />
			</div>

			<div class="flex h-10">
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
						{#each perPageOptions as perPageOption (perPageOption.value)}
							<SelectItem value={perPageOption.value}>{perPageOption.label}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>
		</div>
	</div>

	{#if filterBuilderOpen}
		<div class="shrink-0">
			<CaseFilters
				defs={filterDefs}
				group={filterGroup}
				onChange={(next) => {
					filterGroup = next;
					selectedSavedFilterId = '';
				}}
				onApply={applyFiltersNow}
				onClear={() => {
					filterGroup = emptyGroup('and');
					selectedSavedFilterId = '';
					applyFiltersNow();
				}}
			/>
		</div>
	{/if}

	{#if casesPaginated}
		<CasesDataTable
			class="flex min-h-0 flex-1"
			cases={casesPaginated}
			page={currentPage}
			pageSize={perPage}
			onPageChange={(page) => updateUrl({ page })}
			sort={sort}
			onSortChange={(next) => (sort = next)}
		/>
	{/if}
</div>

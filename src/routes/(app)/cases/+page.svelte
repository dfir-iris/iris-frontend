<script lang="ts">
	import {
		CheckIcon,
		ChevronLeftIcon,
		ExternalLinkIcon,
		FolderOpenIcon,
		PlusIcon,
		SlidersHorizontalIcon,
		UploadIcon
	} from 'lucide-svelte';
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { current_user } from '$lib/stores/auth.store';
	import type { Case, Tags } from '$lib/types/resources/case';
	import type { Paginated } from '$lib/services/api.service';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import { DEFAULT_DEBOUNCE, DEFAULT_ITEMS_PER_PAGE } from '$lib/config/api.config';
	import {
		CaseFilters,
		CaseSavedFiltersBar,
		countActiveConditions,
		emptyGroup,
		isGroup,
		pruneTree,
		treeHasActiveCondition,
		type FilterDef,
		type FilterGroup,
		type FilterLogic,
		type FilterRow
	} from '$lib/components/common/CaseFilters';
	import { UsersService, type User } from '$lib/services/users.service';
	import { CustomersService } from '$lib/services/customers.service';
	import { CaseStatesService, type CaseState } from '$lib/services/case-states.service';
	import { SeveritiesService, type Severity } from '$lib/services/severities.service';
	import {
		CaseClassificationsService,
		type CaseClassification
	} from '$lib/services/case-classifications.service';
	import { MarkDownPreview } from '$lib/components/common/MarkDown';
	import SeverityBadge from '$lib/components/ui/badge/severity-badge.svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import type { CaseStatus, Severity as SeverityName } from '$lib/components/ui/badge/types';
	import { Button } from '$lib/components/ui/button';
	import { toast } from '$lib/components/ui/toast';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
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

	// Sort is driven server-side via `order_by` + `sort_dir` so
	// pagination + sort stay in sync.
	type SortState = { id: string; dir: 'asc' | 'desc' | null } | null;
	let sort = $state<SortState>({ id: 'open_date', dir: 'desc' });

	// Flat mirror of the current page so the queue list can render rows
	// synchronously and manage selection without re-awaiting a promise on
	// every keystroke.
	let caseRows = $state<Case[]>([]);
	let caseTotal = $state(0);
	let listStatus = $state<'loading' | 'idle' | 'error'>('loading');
	let listError = $state<string | null>(null);

	// Lookups feeding the prefilled value pickers in the filter builder.
	let userOptions = $state<{ value: string; label: string }[]>([]);
	let customerOptions = $state<{ value: string; label: string }[]>([]);
	let stateOptions = $state<{ value: string; label: string }[]>([]);
	let severityOptions = $state<{ value: string; label: string }[]>([]);
	// Raw severities kept so the KPI strip can resolve the "Critical"
	// severity_id — the picker options only carry names.
	let severitiesRaw = $state<Severity[]>([]);
	// Cases carry `classification_id` but no nested classification object,
	// so the detail pane resolves the display name through this lookup.
	let classifications = $state<CaseClassification[]>([]);

	const perPageOptions = [5, 10, 25, 50, 100].map((n) => ({
		value: String(n),
		label: `${n} entries`
	}));

	// ── Split-view selection ────────────────────────────────────────────
	// The queue holds the row the analyst clicked; the detail pane needs
	// the *full* case (list rows come back partially hydrated), so we
	// fetch it by id and fall back to the row while that's in flight.
	let selectedId = $state<number | null>(null);
	let selectedFull = $state<Case | null>(null);
	let detailLoading = $state(false);

	const selectedRow = $derived(caseRows.find((c) => c.case_id === selectedId) ?? null);
	const detailCase = $derived(selectedFull?.case_id === selectedId ? selectedFull : selectedRow);

	const selectCase = async (c: Case) => {
		if (selectedId === c.case_id) {
			selectedId = null;
			selectedFull = null;
			return;
		}
		selectedId = c.case_id;
		selectedFull = null;
		detailLoading = true;
		try {
			const full = await cases.get(c.case_id);
			// Guard against a slower earlier request landing last.
			if (selectedId === c.case_id) selectedFull = full;
		} finally {
			if (selectedId === c.case_id) detailLoading = false;
		}
	};

	// Drops back to the queue. Only reachable from the small-screen layout,
	// where the two panes swap instead of sitting side by side.
	const clearSelection = () => {
		selectedId = null;
		selectedFull = null;
	};

	// ── KPI strip ───────────────────────────────────────────────────────
	// Counts come from dedicated `per_page=1` queries rather than being
	// tallied off the current page, so they describe the whole queue and
	// stay correct regardless of paging or the active filter set.
	const STALE_DAYS = 7;

	const myUserId = $derived($current_user?.user_id ?? $current_user?.id ?? null);

	let kpi = $state<{
		open: number | null;
		critical: number | null;
		stalled: number | null;
		mine: number | null;
	}>({ open: null, critical: null, stalled: null, mine: null });

	const readTotal = (res: unknown): number => {
		const r = res as { data?: { total?: number } } | null;
		return typeof r?.data?.total === 'number' ? r.data.total : 0;
	};

	const countCases = async (params: Record<string, unknown>): Promise<number> => {
		try {
			const res = await cases.listPaginated({ page: 1, per_page: 1, ...params });
			return readTotal(res);
		} catch {
			return 0;
		}
	};

	// `open_date <= cutoff` is a plain SQL comparison server-side, so a
	// YYYY-MM-DD bound is enough to mean "opened more than 7 days ago".
	const staleCutoff = (): string => {
		const d = new Date(Date.now() - STALE_DAYS * 86_400_000);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};

	const loadKpis = async () => {
		const criticalId = severitiesRaw.find(
			(s) => s.severity_name?.toLowerCase() === 'critical'
		)?.severity_id;

		const [open, critical, stalled, mine] = await Promise.all([
			countCases({ is_open: true }),
			criticalId != null
				? countCases({ is_open: true, severity_id: criticalId })
				: Promise.resolve(0),
			countCases({ is_open: true, end_open_date: staleCutoff() }),
			myUserId != null ? countCases({ is_open: true, case_owner_id: myUserId }) : Promise.resolve(0)
		]);

		kpi = { open, critical, stalled, mine };
	};

	// Refresh the KPI strip once the severity lookup and the signed-in
	// user have both resolved, and again whenever either changes.
	let lastKpiKey: string | undefined = undefined;
	$effect(() => {
		const key = `${severitiesRaw.length}:${myUserId ?? ''}`;
		if (key === lastKpiKey) return;
		lastKpiKey = key;
		void loadKpis();
	});

	// Filter definitions for the cases overview.
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

	// Queue column headers. `id` feeds `serverOrderBy`; `firstDir` is the
	// direction a fresh click picks, so dates open newest-first while names
	// open A→Z. "Age" sorts on `open_date` — the idle figure next to it is
	// derived from `modification_history` client-side and has no server
	// ordering column, so it deliberately isn't sortable on its own.
	const QUEUE_COLUMNS: {
		id: string;
		label: string;
		/** Column name as it reads mid-sentence, for the page subtitle. */
		sortName: string;
		cls: string;
		firstDir: 'asc' | 'desc';
	}[] = [
		{ id: 'case_name', label: 'Case', sortName: 'name', cls: 'q-col-case', firstDir: 'asc' },
		{
			id: 'state.state_name',
			label: 'Stage',
			sortName: 'stage',
			cls: 'q-col-stage',
			firstDir: 'asc'
		},
		{
			id: 'owner.user_login',
			label: 'Owner',
			sortName: 'owner',
			cls: 'q-col-owner',
			firstDir: 'asc'
		},
		{ id: 'open_date', label: 'Age · Idle', sortName: 'age', cls: 'q-col-age', firstDir: 'desc' }
	];

	// Oldest-first reads as ascending age, so the age column's caret is
	// inverted relative to the underlying `open_date` direction.
	const sortArrow = (columnId: string): string => {
		if (sort?.id !== columnId || !sort.dir) return '';
		const ascending = columnId === 'open_date' ? sort.dir === 'desc' : sort.dir === 'asc';
		return ascending ? '▲' : '▼';
	};

	const toggleSort = (column: { id: string; firstDir: 'asc' | 'desc' }) => {
		sort =
			sort?.id === column.id && sort.dir
				? { id: column.id, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
				: { id: column.id, dir: column.firstDir };

		// A re-sorted queue makes the current page number meaningless.
		updateUrl({ page: 1 });
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
			// The API reads the direction from `sort_dir` (see
			// `parse_pagination_parameters`); `direction` is silently ignored.
			sort_dir: orderBy && direction ? direction : undefined
		};

		const params = urlShowClosed ? baseParams : { ...baseParams, is_open: true };

		listStatus = 'loading';
		listError = null;

		// The queue renders off `caseRows` rather than awaiting the promise in
		// the template, so this only drains the response into local state.
		void cases.filterPaginated(params).then((res) => {
			const raw = res.data;

			if (!raw || typeof raw !== 'object' || typeof raw === 'string') {
				caseRows = [];
				caseTotal = 0;
				listStatus = 'error';
				listError = res.error?.message ?? 'Failed to load cases';
				return;
			}

			const pageData = raw as Paginated<Case>;
			const list = Array.isArray(pageData.data) ? pageData.data : ([] as Case[]);
			const normalized = list.map(normalizeCase);

			caseRows = normalized;
			caseTotal = typeof pageData.total === 'number' ? pageData.total : normalized.length;
			listStatus = 'idle';
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
		const [usersRes, customersRes, statesRes, severitiesRes, classificationsRes] =
			await Promise.all([
				UsersService.list(),
				CustomersService.list(),
				CaseStatesService.list(),
				SeveritiesService.list(),
				CaseClassificationsService.list()
			]);

		classifications = Array.isArray(classificationsRes.data)
			? (classificationsRes.data as CaseClassification[])
			: [];

		const usersData = usersRes.data as { data?: User[] } | User[] | null;
		const users: User[] = Array.isArray(usersData) ? usersData : (usersData?.data ?? []);
		userOptions = users.map((u) => ({
			value: u.user_login,
			label: u.user_name ? `${u.user_name} (${u.user_login})` : u.user_login
		}));

		customerOptions = customersRes.data.map((c) => ({
			value: c.customer_name,
			label: c.customer_name
		}));

		const states = Array.isArray(statesRes.data) ? (statesRes.data as CaseState[]) : [];
		stateOptions = states.map((s) => ({ value: s.state_name, label: s.state_name }));

		const severities = Array.isArray(severitiesRes.data) ? (severitiesRes.data as Severity[]) : [];
		severitiesRaw = severities;
		severityOptions = severities.map((s) => ({ value: s.severity_name, label: s.severity_name }));
	};

	$effect(() => {
		void loadLookups();
	});

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
		if (!(await cases.removeSavedFilter(id))) {
			toast({
				title: 'Failed to delete saved filter',
				description: cases.mutation.error ?? 'The filter is still available.',
				variant: 'destructive'
			});

			return;
		}

		toast({ title: 'Saved filter deleted', variant: 'success' });
		if (selectedSavedFilterId === String(id)) selectedSavedFilterId = '';
	};

	const saveCurrentFilter = async (meta: {
		name: string;
		description: string;
		isPrivate: boolean;
	}) => {
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

	// Badge on the Filters button. Counts only the builder's conditions —
	// the search box and Show closed have their own visible controls in the
	// header, so folding them in here would double-report them.
	const activeConditionCount = $derived(countActiveConditions(filterGroup));

	// ── Presentation helpers ────────────────────────────────────────────

	const ownerName = (c: Case | null): string => {
		const o = c?.owner as { user_name?: string; user_login?: string } | null | undefined;
		return o?.user_name || o?.user_login || '';
	};

	const ageDays = (iso: string | null | undefined): number => {
		if (!iso) return 0;
		const t = new Date(iso).getTime();
		if (Number.isNaN(t)) return 0;
		return Math.floor((Date.now() - t) / 86_400_000);
	};

	const ageLabel = (iso: string | null | undefined): string => {
		if (!iso) return '—';
		const days = ageDays(iso);
		if (days === 0) return 'today';
		if (days === 1) return '1d';
		return `${days}d`;
	};

	const isStalled = (c: Case | null): boolean =>
		!!c?.open_date && !c?.close_date && ageDays(c.open_date) > STALE_DAYS;

	// Canonical IRIS investigation pipeline, in the order the seeded case
	// states are created (see post_init). `CaseState` carries no ordering
	// column, so the progression has to be named here; states outside the
	// pipeline (Unspecified / In progress, plus any custom state a
	// deployment adds) resolve to -1 and simply render no progress bar.
	const STAGES = [
		'Open',
		'Containment',
		'Eradication',
		'Recovery',
		'Post-Incident',
		'Reporting',
		'Closed'
	];

	const stageIndex = (name: string | null | undefined): number =>
		STAGES.findIndex((s) => s.toLowerCase() === (name ?? '').toLowerCase().trim());

	/** Two-letter avatar chip, matching the alert cockpit's convention. */
	const initials = (name: string | null | undefined): string => {
		const parts = (name ?? '')
			.trim()
			.split(/[\s._-]+/)
			.filter(Boolean);
		if (parts.length === 0) return '??';
		if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
		return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
	};

	/**
	 * "Idle" = how long the case has sat untouched. `modification_history`
	 * is keyed by unix seconds (same shape as the alert history), so the
	 * newest key is the last time anything moved. Cases with no history
	 * fall back to their open date, which is the correct reading: nothing
	 * has happened since they were opened.
	 */
	const lastActivityAt = (c: Case | null): number | null => {
		const h = c?.modification_history as Record<string, unknown> | null | undefined;
		if (h && typeof h === 'object') {
			const stamps = Object.keys(h)
				.map(Number)
				.filter((n) => Number.isFinite(n) && n > 0);
			if (stamps.length > 0) return Math.max(...stamps) * 1000;
		}
		if (!c?.open_date) return null;
		const t = new Date(c.open_date).getTime();
		return Number.isNaN(t) ? null : t;
	};

	const idleDays = (c: Case | null): number | null => {
		const at = lastActivityAt(c);
		if (at === null) return null;
		return Math.max(0, Math.floor((Date.now() - at) / 86_400_000));
	};

	const classificationName = (c: Case | null): string => {
		if (c?.classification_id == null) return '—';
		const hit = classifications.find((k) => k.id === c.classification_id);
		return hit?.name_expanded || hit?.name || `#${c.classification_id}`;
	};

	const formatDate = (iso: string | null | undefined): string => {
		if (!iso) return '—';
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return '—';
		return d.toLocaleString(undefined, {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	};

	const stripCaseIdPrefix = (name: string | null | undefined): string => {
		const m = (name ?? '').match(/^#\d+\s*-\s*(.+)$/);
		return m ? m[1] : (name ?? '');
	};

	// ── Header ──────────────────────────────────────────────────────────

	// Row density only changes padding, so it is presentation-local — no need
	// to round-trip it through the URL.
	let density = $state<'comfortable' | 'compact'>('comfortable');

	const applyKpiFilter = (row: FilterRow) => {
		filterGroup = { logic: 'and', items: [row] };
		selectedSavedFilterId = '';
		applyFiltersNow();
	};

	// The KPI strip mirrors whatever `filterGroup` currently holds rather than
	// tracking its own selection, so hand-edits in the filter builder can't
	// leave a card highlighted for a filter that is no longer applied.
	const activeKpi = $derived.by(() => {
		const [only, ...rest] = filterGroup.items;

		if (only && rest.length === 0 && !isGroup(only)) {
			if (only.fieldId === 'severity' && only.value.toLowerCase() === 'critical') {
				return 'critical';
			}
			if (only.fieldId === 'owner' && only.value === $current_user?.user_login) {
				return 'mine';
			}
		}

		return hasActiveFilter ? null : 'open';
	});

	const kpiCards = $derived([
		{
			id: 'open',
			label: 'Open',
			value: kpi.open,
			// `hasActiveFilter` also counts the search box and the closed
			// toggle, so this card has to reset all three to light up again.
			select: () => {
				search = '';
				selectedSavedFilterId = '';
				filterGroup = emptyGroup('and');
				applyFiltersNow();
				updateUrl({ search: '', showClosed: false, page: 1 });
			}
		},
		{
			id: 'critical',
			label: 'Critical',
			value: kpi.critical,
			select: () => {
				const crit = severitiesRaw.find((s) => s.severity_name?.toLowerCase() === 'critical');
				if (crit)
					applyKpiFilter({ fieldId: 'severity', operation: 'equals', value: crit.severity_name });
			}
		},
		{
			id: 'stalled',
			// This counts cases *opened* more than STALE_DAYS ago, which is all
			// the API can filter on. Real staleness would need last-activity,
			// which only exists per-case in `modification_history`, so the label
			// says what the number actually is.
			label: `Opened > ${STALE_DAYS}d`,
			value: kpi.stalled,
			// A date window rather than a field match, so there is no equivalent
			// filter row to hand the builder — display only.
			select: null
		},
		{
			id: 'mine',
			label: 'Assigned to me',
			value: kpi.mine,
			select: () => {
				const me = $current_user?.user_login;
				if (me) applyKpiFilter({ fieldId: 'owner', operation: 'equals', value: me });
			}
		}
	]);

	const sortLabel = $derived(QUEUE_COLUMNS.find((c) => c.id === sort?.id)?.sortName ?? 'age');

	const queueSubtitle = $derived(
		kpi.open === null
			? 'Counting the open queue…'
			: `${kpi.open} open ${kpi.open === 1 ? 'investigation' : 'investigations'}, sorted by ${sortLabel}.`
	);

	const lastPage = $derived(Math.max(1, Math.ceil(caseTotal / Number(perPage))));
	const rangeLabel = $derived(
		caseTotal === 0
			? '0 of 0'
			: `${(currentPage - 1) * Number(perPage) + 1}–${Math.min(currentPage * Number(perPage), caseTotal)} of ${caseTotal}`
	);
</script>

<svelte:head>
	<title>Overview</title>
</svelte:head>

<div class="ov-root">
	<!--
	  ── Header ─────────────────────────────────────────────────────────
	  One line: what the page is, how to narrow it, what to add to it.
	  Title left, query controls in the middle, primary actions at the end.
	-->
	<header class="ov-head">
		<div class="ov-head-text">
			<h1 class="ov-title">Case queue</h1>
			<p class="ov-sub">{queueSubtitle}</p>
		</div>

		<div class="ov-tools ov-tools--query">
			<div class="ov-search">
				<Searchbar placeholder="Filter by title, ID, tag…" bind:value={search} />
			</div>

			<!--
			  One entry point to everything filter-related. The badge is the
			  condition count so the button reports the current state without
			  the panel having to be open.
			-->
			<Button
				variant={filterBuilderOpen ? 'default' : 'outline'}
				size="sm"
				aria-expanded={filterBuilderOpen}
				aria-controls="case-filter-panel"
				onclick={() => (filterBuilderOpen = !filterBuilderOpen)}
			>
				<SlidersHorizontalIcon />
				Filters
				{#if activeConditionCount > 0}
					<span class="ov-badge">{activeConditionCount}</span>
				{/if}
			</Button>

			<div class="ov-showclosed">
				<Checkbox
					id="show_closed"
					checked={showClosed}
					onCheckedChange={(checked) => updateUrl({ showClosed: checked === true, page: 1 })}
				/>
				<Label for="show_closed" class="cursor-pointer text-xs font-normal">Show closed</Label>
			</div>
		</div>

		<span class="ov-sep" aria-hidden="true"></span>

		<div class="ov-head-actions">
			<Button variant="outline" size="sm" onclick={() => goto('/cases/import')}>
				<UploadIcon />
				Import
			</Button>

			<Button size="sm" onclick={() => (cases.ui.showAddModal = true)}>
				<PlusIcon />
				Open a case
			</Button>
		</div>
	</header>

	<!--
	  ── KPI strip + view controls ──────────────────────────────────────
	  The counts double as one-click filters; page size and row density are
	  display-only, so they sit apart at the end of the same row.
	-->
	{#snippet kpiBody(card: (typeof kpiCards)[number])}
		<span class="kpi-dot" aria-hidden="true"></span>
		<span class="kpi-lbl">{card.label}</span>
		<span class="kpi-val">{card.value ?? '—'}</span>
	{/snippet}

	<div class="ov-subhead">
		<div class="ov-kpis">
			{#each kpiCards as card (card.id)}
				{@const active = activeKpi === card.id}
				{#if card.select}
					<button
						type="button"
						class="kpi kpi--{card.id}"
						class:kpi--active={active}
						aria-pressed={active}
						onclick={card.select}
					>
						{@render kpiBody(card)}
					</button>
				{:else}
					<div class="kpi kpi--{card.id}">{@render kpiBody(card)}</div>
				{/if}
			{/each}
		</div>

		<div class="ov-tools ov-tools--view">
			<div class="ov-perpage">
				<Select
					value={String(perPage)}
					onValueChange={(value) => {
						perPage = Number(value);
						currentPage = 1;
						updateUrl({ page: 1 });
					}}
					type="single"
				>
					<SelectTrigger>{perPage} / page</SelectTrigger>
					<SelectContent>
						{#each perPageOptions as perPageOption (perPageOption.value)}
							<SelectItem value={perPageOption.value}>{perPageOption.label}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>

			<!-- Row density. Segmented control, matching the queue mockup. -->
			<div class="ov-density" role="group" aria-label="Row density">
				<button
					type="button"
					class:ov-density--on={density === 'comfortable'}
					onclick={() => (density = 'comfortable')}
				>
					Comfortable
				</button>
				<button
					type="button"
					class:ov-density--on={density === 'compact'}
					onclick={() => (density = 'compact')}
				>
					Compact
				</button>
			</div>
		</div>
	</div>

	<!--
	  ── Filter panel ───────────────────────────────────────────────────
	  Every filter verb lives in this one card, top to bottom in the order
	  you use them: load a preset, build the conditions, then save / clear /
	  apply. Scattering them across the header meant "Save filter" sat above
	  the thing it saves and "Apply" floated under the density toggle.
	-->
	{#if filterBuilderOpen}
		<div class="ov-filterpanel" id="case-filter-panel">
			<div class="ov-fp-head">
				<span class="ov-fp-title">Filter the queue</span>

				<CaseSavedFiltersBar
					part="presets"
					presets={cases.savedFilters.items}
					selectedId={selectedSavedFilterId}
					{hasActiveFilter}
					saving={savingFilter}
					onSelect={(id) => applySavedFilter(id)}
					onClear={clearActiveFilter}
					onDelete={(id) => deleteSavedFilter(id)}
					onSave={(meta) => saveCurrentFilter(meta)}
				/>
			</div>

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
			>
				{#snippet footerStart()}
					<CaseSavedFiltersBar
						part="save"
						presets={cases.savedFilters.items}
						selectedId={selectedSavedFilterId}
						{hasActiveFilter}
						saving={savingFilter}
						onSelect={(id) => applySavedFilter(id)}
						onClear={clearActiveFilter}
						onDelete={(id) => deleteSavedFilter(id)}
						onSave={(meta) => saveCurrentFilter(meta)}
					/>
				{/snippet}
			</CaseFilters>
		</div>
	{/if}

	<!-- ── Split: queue | detail ──────────────────────────────────────
	     Side by side on wide screens. Narrow ones show one pane at a time
	     and use this flag to pick which — see the media query. -->
	<div class="ov-split" class:ov-split--detail={detailCase !== null}>
		<!-- Queue -->
		<div class="ov-queue" class:ov-queue--compact={density === 'compact'}>
			<div class="q-head">
				{#each QUEUE_COLUMNS as col (col.id)}
					{@const arrow = sortArrow(col.id)}
					<button
						type="button"
						class="q-sort {col.cls}"
						class:q-sort--active={arrow !== ''}
						aria-label="Sort by {col.label}{arrow === ''
							? ''
							: arrow === '▲'
								? ' (ascending)'
								: ' (descending)'}"
						onclick={() => toggleSort(col)}
					>
						<span>{col.label}</span>
						<span class="q-sort-arrow" aria-hidden="true">{arrow}</span>
					</button>
				{/each}
			</div>

			<div class="q-list">
				{#if listStatus === 'loading'}
					<div class="q-loading">
						{#each Array(8) as _}
							<Skeleton class="h-11 w-full" />
						{/each}
					</div>
				{:else if listStatus === 'error'}
					<div class="q-error">{listError}</div>
				{:else if caseRows.length === 0}
					<div class="q-empty">
						<FolderOpenIcon class="h-8 w-8 opacity-40" />
						<p>No cases match this view.</p>
						{#if hasActiveFilter}
							<Button size="sm" variant="outline" onclick={clearActiveFilter}>Clear filters</Button>
						{/if}
					</div>
				{:else}
					{#each caseRows as c (c.case_id)}
						{@const active = selectedId === c.case_id}
						{@const stalled = isStalled(c)}
						{@const stage = stageIndex(c.state?.state_name)}
						{@const owner = ownerName(c)}
						{@const idle = idleDays(c)}
						<button
							type="button"
							class="q-row {active ? 'q-row--active' : ''}"
							onclick={() => void selectCase(c)}
						>
							<!-- Case: severity + title, then identifiers, then tags -->
							<div class="q-cell-case">
								<div class="q-case-line">
									{#if c.severity?.severity_name}
										<SeverityBadge severity={c.severity.severity_name as SeverityName} />
									{/if}
									<span class="q-title" title={c.case_name}>
										{stripCaseIdPrefix(c.case_name)}
									</span>
								</div>
								<div class="q-ident">
									{#if c.case_soc_id}
										<span class="q-soc">{c.case_soc_id}</span>
										<span class="q-dot">·</span>
									{/if}
									<span class="q-id">#{c.case_id}</span>
									{#if c.case_customer?.customer_name}
										<span class="q-dot">·</span>
										<span class="q-cust" title={c.case_customer.customer_name}>
											{c.case_customer.customer_name}
										</span>
									{/if}
								</div>
								{#if c.tags?.length}
									<div class="q-tags">
										{#each c.tags.slice(0, 3) as t, i (t.tag_title ?? i)}
											<span class="q-tag">{t.tag_title}</span>
										{/each}
										{#if c.tags.length > 3}
											<span class="q-tag q-tag--more">+{c.tags.length - 3}</span>
										{/if}
									</div>
								{/if}
							</div>

							<!-- Stage: name + pipeline progress -->
							<div class="q-cell-stage">
								<span class="q-stage-name">{c.state?.state_name ?? '—'}</span>
								{#if stage >= 0}
									<span class="q-pipe" aria-hidden="true">
										{#each STAGES as s, i (s)}
											<span
												class="q-seg {i < stage ? 'q-seg--done' : ''} {i === stage
													? 'q-seg--now'
													: ''}"
											></span>
										{/each}
									</span>
								{/if}
							</div>

							<!-- Owner: avatar chip + name, or an explicit unassigned state -->
							<div class="q-cell-owner">
								{#if owner}
									<span class="q-avatar">{initials(owner)}</span>
									<span class="q-owner-name" title={owner}>{owner}</span>
								{:else}
									<span class="q-avatar q-avatar--none">?</span>
									<span class="q-owner-none">Unassigned</span>
								{/if}
							</div>

							<!-- Age · Idle -->
							<div class="q-cell-age">
								<span class="q-age {stalled ? 'q-age--stalled' : ''}">{ageLabel(c.open_date)}</span>
								{#if idle !== null}
									<span class="q-idle {idle > STALE_DAYS ? 'q-idle--hot' : ''}">
										idle {idle}d
									</span>
								{/if}
							</div>
						</button>
					{/each}
				{/if}
			</div>

			<div class="q-foot">
				<button
					type="button"
					class="q-page-btn"
					disabled={currentPage <= 1}
					onclick={() => updateUrl({ page: currentPage - 1 })}
				>
					Prev
				</button>
				<span class="q-page-lbl">{rangeLabel} · page {currentPage}/{lastPage}</span>
				<button
					type="button"
					class="q-page-btn"
					disabled={currentPage >= lastPage}
					onclick={() => updateUrl({ page: currentPage + 1 })}
				>
					Next
				</button>
			</div>
		</div>

		<!-- Detail -->
		<div class="ov-detail">
			{#if !detailCase}
				<div class="d-empty">
					<FolderOpenIcon class="h-10 w-10 opacity-30" />
					<p>Select a case to see its summary.</p>
				</div>
			{:else}
				{@const c = detailCase}
				{@const stage = stageIndex(c.state?.state_name)}
				{@const idle = idleDays(c)}
				<!-- Only rendered on small screens, where this pane replaces
				     the queue rather than sitting beside it. -->
				<button type="button" class="d-back" onclick={clearSelection}>
					<ChevronLeftIcon class="h-3.5 w-3.5" />
					Back to queue
				</button>
				<div class="d-head">
					<div class="d-head-top">
						{#if c.severity?.severity_name}
							<SeverityBadge severity={c.severity.severity_name as SeverityName} />
						{/if}
						{#if c.case_soc_id}
							<span class="d-soc">{c.case_soc_id}</span>
							<span class="q-dot">·</span>
						{/if}
						<span class="d-id">#{c.case_id}</span>
						<div class="ov-spacer"></div>
						{#if c.state?.state_name}
							<StatusBadge status={c.state.state_name as CaseStatus} />
						{/if}
					</div>

					<h2 class="d-title">{stripCaseIdPrefix(c.case_name)}</h2>

					<!-- Primary actions. "Open workspace" is the main path into
					     the case; the rest are the shortcuts an analyst reaches
					     for straight off the queue. -->
					<div class="d-actions">
						<a class="d-btn d-btn--primary" href={`/case/${c.case_id}`}>
							Open workspace
							<ExternalLinkIcon class="h-3.5 w-3.5" />
						</a>
						<a class="d-btn" href={`/case/${c.case_id}/notes`}>Add note</a>
						{#if isStalled(c)}
							<span class="d-stalled">Stalled {ageDays(c.open_date)}d</span>
						{/if}
					</div>

					<!-- Investigation pipeline -->
					{#if stage >= 0}
						<ol class="d-steps" aria-label="Investigation progress">
							{#each STAGES as s, i (s)}
								<li
									class="d-step"
									class:d-step--done={i < stage}
									class:d-step--now={i === stage}
									aria-current={i === stage ? 'step' : undefined}
								>
									<span class="d-step-mark" aria-hidden="true">
										{#if i < stage}<CheckIcon class="size-2.5" strokeWidth={3.5} />{/if}
									</span>
									<span class="d-step-lbl" title={s}>{s}</span>
									<span class="sr-only">
										{i < stage ? 'completed' : i === stage ? 'current stage' : 'not started'}
									</span>
								</li>
							{/each}
						</ol>
					{/if}
				</div>

				<div class="d-body">
					<div class="d-meta">
						<div class="d-meta-cell">
							<span class="d-meta-lbl">Customer</span>
							<span class="d-meta-val">{c.case_customer?.customer_name ?? '—'}</span>
						</div>
						<div class="d-meta-cell">
							<span class="d-meta-lbl">Owner</span>
							<span class="d-meta-val d-meta-val--owner">
								{#if ownerName(c)}
									<span class="q-avatar">{initials(ownerName(c))}</span>
									{ownerName(c)}
								{:else}
									<span class="q-avatar q-avatar--none">?</span>
									<span class="q-owner-none">Unassigned</span>
								{/if}
							</span>
						</div>
						<div class="d-meta-cell">
							<span class="d-meta-lbl">Opened</span>
							<span class="d-meta-val">
								{formatDate(c.open_date)}
								{#if c.open_date}<span class="d-meta-dim"> · {ageLabel(c.open_date)}</span>{/if}
							</span>
						</div>
						<div class="d-meta-cell">
							<span class="d-meta-lbl">{c.close_date ? 'Closed' : 'Last activity'}</span>
							<span class="d-meta-val">
								{#if c.close_date}
									{formatDate(c.close_date)}
								{:else if idle !== null}
									<span class={idle > STALE_DAYS ? 'd-meta-hot' : ''}>{idle}d ago</span>
								{:else}
									—
								{/if}
							</span>
						</div>
						<div class="d-meta-cell">
							<span class="d-meta-lbl">Classification</span>
							<span class="d-meta-val">{classificationName(c)}</span>
						</div>
						<div class="d-meta-cell">
							<span class="d-meta-lbl">Tags</span>
							<span class="d-meta-val">
								{#if c.tags?.length}
									<span class="d-tags">
										{#each c.tags as t, i (t.tag_title ?? i)}
											<span class="d-tag">{t.tag_title}</span>
										{/each}
									</span>
								{:else}
									—
								{/if}
							</span>
						</div>
					</div>

					{#if detailLoading && !selectedFull}
						<div class="d-section">
							<Skeleton class="h-4 w-24" />
							<Skeleton class="h-16 w-full" />
						</div>
					{/if}

					{#if c.case_description?.trim()}
						<div class="d-section">
							<h3 class="d-section-title">Summary</h3>
							<MarkDownPreview markdown={c.case_description ?? ''} />
						</div>
					{/if}

					{#if c.closing_note?.trim()}
						<div class="d-section">
							<h3 class="d-section-title">Outcome</h3>
							<MarkDownPreview markdown={c.closing_note ?? ''} />
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.ov-root {
		/* One height for every control in the header. The shared Input is `h-10`
		   and `size="sm"` buttons are `h-8`; left alone they stagger by 8px. */
		--tool-h: 2rem;
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
		gap: 0.75rem;
		padding: 1rem 1rem 0;
	}
	.ov-spacer {
		flex: 1;
	}

	/* ── Header row ────────────────────────────────────────────────── */
	/* Title · query controls · primary actions, all on one line. Only wraps
	   once the viewport genuinely can't hold them. */
	.ov-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		flex-shrink: 0;
	}
	/* Pushes everything after it to the end of the row. */
	.ov-head-text {
		min-width: 0;
		margin-right: auto;
	}
	/* Sized to sit level with the 2rem controls beside it rather than tower
	   over them. */
	.ov-title {
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.2;
		letter-spacing: -0.02em;
		color: hsl(var(--foreground));
	}
	.ov-sub {
		max-width: 34rem;
		font-size: 0.75rem;
		line-height: 1.35;
		color: hsl(var(--muted-foreground));
	}
	.ov-head-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	/* ── KPI + view row ────────────────────────────────────────────── */
	.ov-subhead {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
		flex-shrink: 0;
	}

	/* ── KPI chips ─────────────────────────────────────────────────── */
	/* Single compact row: swatch · label · count. These are a glance-and-filter
	   control, not the focus of the page, so they stay out of the way. */
	.ov-kpis {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
		flex-shrink: 0;
	}
	.kpi {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		height: 1.75rem;
		padding: 0 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		background: hsl(var(--card));
		text-align: left;
		color: inherit;
		transition:
			box-shadow 120ms ease,
			border-color 120ms ease;
	}
	button.kpi {
		cursor: pointer;
	}
	button.kpi:hover {
		border-color: hsl(214 91% 40% / 0.5);
	}
	button.kpi:focus-visible {
		outline: 2px solid hsl(214 91% 40%);
		outline-offset: 2px;
	}
	.kpi--active {
		border-color: hsl(214 91% 22%);
		box-shadow: 0 0 0 1px hsl(214 91% 22%);
	}
	:global(.dark) .kpi--active {
		border-color: hsl(214 91% 55%);
		box-shadow: 0 0 0 1px hsl(214 91% 55%);
	}
	.kpi-lbl {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
	}
	/* The square swatch is the mockup's colour key for each metric. */
	.kpi-dot {
		width: 0.375rem;
		height: 0.375rem;
		border-radius: 1px;
		flex-shrink: 0;
	}
	.kpi--open .kpi-dot {
		background: hsl(214 91% 22%);
	}
	.kpi--critical .kpi-dot {
		background: hsl(var(--destructive));
	}
	.kpi--stalled .kpi-dot {
		background: hsl(38 92% 45%);
	}
	.kpi--mine .kpi-dot {
		background: hsl(214 91% 45%);
	}
	.kpi-val {
		font-size: 0.8125rem;
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}
	/* ── Control clusters ──────────────────────────────────────────── */
	/* A cluster of related controls — tighter than the gap between clusters.
	   Clusters never break internally; if a row runs out of width the whole
	   cluster wraps below, which stays readable. */
	.ov-tools {
		display: flex;
		flex-wrap: nowrap;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
	}
	/* Shrinks (through the search field) before it wraps, so the header holds
	   one line down to a fairly narrow viewport. */
	.ov-tools--query {
		flex: 0 1 auto;
	}
	.ov-tools--view {
		flex: 0 0 auto;
		margin-left: auto;
	}
	/* Only the search field gives ground when the row tightens. */
	.ov-tools > :global(:not(.ov-search)) {
		flex-shrink: 0;
	}
	.ov-sep {
		flex-shrink: 0;
		width: 1px;
		height: 1rem;
		background: hsl(var(--border));
	}
	.ov-search {
		display: flex;
		min-width: 9rem;
		flex: 0 1 16rem;
	}
	/* Searchbar's root is `position: relative` with an inner `w-full` input, so
	   it needs to fill this slot or the field renders narrower than the space
	   reserved for it and leaves a gap before the next control. */
	.ov-search > :global(div) {
		width: 100%;
	}
	.ov-search :global(input) {
		height: var(--tool-h);
	}
	/* Searchbar pins its icons at `top-2` for the default 2.5rem field; nudge
	   them back to centre now that the field is shorter. */
	.ov-search :global(.absolute) {
		top: 0.375rem;
	}
	.ov-perpage {
		display: flex;
		height: var(--tool-h);
	}
	.ov-showclosed {
		display: flex;
		align-items: center;
		gap: 0.4375rem;
		height: var(--tool-h);
		padding: 0 0.625rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		background: hsl(var(--background));
	}
	.ov-showclosed:hover {
		border-color: hsl(var(--ring) / 0.4);
	}
	.ov-density {
		display: flex;
		height: var(--tool-h);
		padding: 0.125rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		background: hsl(var(--muted) / 0.5);
	}
	.ov-density button {
		padding: 0 0.625rem;
		border: none;
		border-radius: 0.375rem;
		background: transparent;
		font-size: 0.6875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
	}
	.ov-density button:hover {
		color: hsl(var(--foreground));
	}
	.ov-density button:focus-visible {
		outline: 2px solid hsl(214 91% 40%);
		outline-offset: 1px;
	}
	.ov-density .ov-density--on {
		background: hsl(214 91% 22%);
		color: hsl(0 0% 100%);
	}
	/* ── Filter panel ──────────────────────────────────────────────── */
	/* A card, so the preset picker, the conditions and the actions read as
	   one block rather than three things loose on the page. */
	.ov-filterpanel {
		flex-shrink: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding: 0.75rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.625rem;
		background: hsl(var(--muted) / 0.35);
	}
	.ov-fp-head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem 0.75rem;
	}
	.ov-fp-title {
		margin-right: auto;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: hsl(var(--muted-foreground));
	}

	/* Condition count on the Filters button. Tinted from the button's own ink
	   rather than a fixed colour, so it reads on both the outline and the
	   filled variant without a second rule. */
	.ov-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1rem;
		height: 1rem;
		margin-left: 0.125rem;
		padding: 0 0.25rem;
		border-radius: 999px;
		background: color-mix(in srgb, currentColor 20%, transparent);
		font-size: 0.625rem;
		font-weight: 700;
		line-height: 1;
		font-variant-numeric: tabular-nums;
	}

	/* ── Split ─────────────────────────────────────────────────────── */
	.ov-split {
		flex: 1;
		min-height: 0;
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(380px, 1fr);
		gap: 0;
		border: 1px solid hsl(var(--border));
		border-bottom: none;
		border-radius: 0.625rem 0.625rem 0 0;
		overflow: hidden;
		background: hsl(var(--card));
	}

	/* ── Queue ─────────────────────────────────────────────────────── */
	.ov-queue {
		display: flex;
		flex-direction: column;
		min-height: 0;
		border-right: 1px solid hsl(var(--border));
	}
	/* Queue rows and the header share one column track so the values stay
	   aligned under their labels. */
	.q-head,
	.q-row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 8.5rem 9rem 5.25rem;
		gap: 0.75rem;
		align-items: center;
	}
	.q-head {
		flex-shrink: 0;
		height: 2rem;
		padding: 0 0.875rem;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.35);
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: hsl(var(--muted-foreground));
	}
	.q-col-age {
		text-align: right;
	}
	/* Header cells are buttons, so strip the UA chrome and re-inherit the
	   uppercase label styling from `.q-head`. */
	.q-sort {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		min-width: 0;
		padding: 0;
		border: 0;
		background: none;
		font: inherit;
		letter-spacing: inherit;
		text-transform: inherit;
		color: inherit;
		cursor: pointer;
	}
	.q-sort:hover {
		color: hsl(var(--foreground));
	}
	.q-sort:focus-visible {
		outline: 2px solid hsl(214 91% 40%);
		outline-offset: 2px;
		border-radius: 2px;
	}
	.q-sort--active {
		color: hsl(var(--foreground));
	}
	.q-sort.q-col-age {
		justify-content: flex-end;
	}
	.q-sort-arrow {
		font-size: 0.5rem;
		line-height: 1;
	}
	.q-list {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}
	.q-loading {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding: 0.625rem 0.875rem;
	}
	.q-error {
		padding: 1.5rem 1rem;
		text-align: center;
		font-size: 0.75rem;
		color: hsl(var(--destructive));
	}
	.q-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 3rem 1rem;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.q-row {
		width: 100%;
		padding: 0.5rem 0.875rem;
		border: none;
		border-left: 2px solid transparent;
		border-bottom: 1px solid hsl(var(--border) / 0.6);
		background: transparent;
		text-align: left;
		cursor: pointer;
		color: inherit;
	}
	.q-row:hover {
		background: hsl(var(--muted) / 0.45);
	}
	.q-row--active {
		background: hsl(214 91% 40% / 0.08);
		border-left-color: hsl(214 91% 35%);
	}
	/* Compact drops the row padding and the tag chips — the two things that
	   cost the most vertical space — so more of the queue fits on screen. */
	.ov-queue--compact .q-row {
		padding-top: 0.3125rem;
		padding-bottom: 0.3125rem;
	}
	.ov-queue--compact .q-tags {
		display: none;
	}

	/* Case cell */
	.q-cell-case {
		display: flex;
		flex-direction: column;
		gap: 0.1875rem;
		min-width: 0;
	}
	.q-case-line {
		display: flex;
		align-items: center;
		gap: 0.4375rem;
		min-width: 0;
	}
	.q-title {
		min-width: 0;
		font-size: 0.8125rem;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.q-ident {
		display: flex;
		align-items: center;
		gap: 0.3125rem;
		min-width: 0;
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}
	.q-soc,
	.q-id {
		font-family: ui-monospace, monospace;
		font-variant-numeric: tabular-nums;
	}
	.q-dot {
		opacity: 0.45;
	}
	.q-cust {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.q-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.q-tag {
		font-size: 0.625rem;
		line-height: 1.4;
		padding: 0 0.375rem;
		border-radius: 999px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.55);
		color: hsl(var(--muted-foreground));
	}
	.q-tag--more {
		opacity: 0.75;
	}

	/* Stage cell */
	.q-cell-stage {
		display: flex;
		flex-direction: column;
		gap: 0.3125rem;
		min-width: 0;
	}
	.q-stage-name {
		font-size: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.q-pipe {
		display: flex;
		gap: 2px;
	}
	.q-seg {
		flex: 1;
		height: 3px;
		border-radius: 999px;
		background: hsl(var(--muted-foreground) / 0.2);
	}
	/* Row scale is too small for the detail pane's tick marks, so cleared
	   stages fill in solid instead — same progress read, 3px tall. */
	.q-seg--done {
		background: hsl(214 91% 35% / 0.55);
	}
	.q-seg--now {
		background: hsl(214 91% 35%);
	}

	/* Owner cell */
	.q-cell-owner {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		min-width: 0;
	}
	.q-avatar {
		flex-shrink: 0;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: 999px;
		background: hsl(214 91% 35% / 0.12);
		color: hsl(214 91% 32%);
		font-size: 0.5625rem;
		font-weight: 700;
		letter-spacing: 0.02em;
	}
	.q-avatar--none {
		background: transparent;
		border: 1px dashed hsl(38 92% 45% / 0.7);
		color: hsl(38 92% 40%);
	}
	.q-owner-name {
		font-size: 0.75rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.q-owner-none {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(38 92% 40%);
	}

	/* Age · Idle cell */
	.q-cell-age {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.125rem;
	}
	.q-age {
		font-size: 0.75rem;
		font-weight: 500;
		font-variant-numeric: tabular-nums;
	}
	.q-age--stalled {
		color: hsl(38 92% 42%);
	}
	.q-idle {
		font-size: 0.625rem;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--muted-foreground));
	}
	.q-idle--hot {
		color: hsl(var(--destructive));
		font-weight: 600;
	}

	.q-foot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		flex-shrink: 0;
		height: 2.25rem;
		padding: 0 0.875rem;
		border-top: 1px solid hsl(var(--border));
	}
	.q-page-btn {
		font-size: 0.6875rem;
		padding: 0.1875rem 0.5rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.3125rem;
		background: transparent;
		cursor: pointer;
		color: inherit;
	}
	.q-page-btn:hover:not(:disabled) {
		background: hsl(var(--muted) / 0.6);
	}
	.q-page-btn:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.q-page-lbl {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		font-variant-numeric: tabular-nums;
	}

	/* ── Detail ────────────────────────────────────────────────────── */
	.ov-detail {
		display: flex;
		flex-direction: column;
		min-height: 0;
		overflow: hidden;
	}
	.d-empty {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.625rem;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
	}
	.d-head {
		flex-shrink: 0;
		padding: 1rem 1.25rem 0.875rem;
		border-bottom: 1px solid hsl(var(--border));
	}
	.d-head-top {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 0.375rem;
	}
	.d-id {
		font-family: ui-monospace, monospace;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}
	.d-soc {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}
	.d-title {
		font-size: 1rem;
		font-weight: 600;
		line-height: 1.35;
		margin-bottom: 0.75rem;
	}

	/* Actions */
	.d-actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.375rem;
	}
	.d-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.3125rem 0.6875rem;
		border: 1px solid hsl(var(--border));
		border-radius: 0.375rem;
		background: hsl(var(--background));
		color: inherit;
		text-decoration: none;
		cursor: pointer;
		white-space: nowrap;
	}
	.d-btn:hover:not(:disabled) {
		background: hsl(var(--muted) / 0.6);
	}
	.d-btn:disabled {
		opacity: 0.55;
		cursor: default;
	}
	.d-btn--primary {
		background: hsl(214 91% 22%);
		border-color: hsl(214 91% 22%);
		color: white;
	}
	.d-btn--primary:hover {
		background: hsl(214 91% 28%);
	}

	/* Pipeline — a checklist rather than a bar, so the stages already cleared
	   read as done at a glance and the current one is unambiguous. */
	.d-steps {
		margin-top: 0.875rem;
		display: grid;
		grid-template-columns: repeat(7, minmax(0, 1fr));
		list-style: none;
	}
	.d-step {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3125rem;
		min-width: 0;
	}
	/* Connector to the next step, drawn from this marker's centre. It is
	   filled only once this step is done, so the line tracks progress too. */
	.d-step::after {
		content: '';
		position: absolute;
		top: 0.4375rem;
		left: calc(50% + 0.5rem);
		right: calc(-50% + 0.5rem);
		height: 2px;
		background: hsl(var(--muted-foreground) / 0.2);
	}
	.d-step:last-child::after {
		display: none;
	}
	.d-step--done::after {
		background: hsl(214 91% 35%);
	}
	.d-step-mark {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 0.875rem;
		height: 0.875rem;
		border: 1px solid hsl(var(--border));
		border-radius: 999px;
		background: hsl(var(--card));
		color: hsl(0 0% 100%);
	}
	.d-step--done .d-step-mark {
		border-color: hsl(214 91% 22%);
		background: hsl(214 91% 22%);
	}
	/* Current stage: an unfilled ring, so it reads as "in progress" next to
	   the solid ticks behind it. */
	.d-step--now .d-step-mark {
		border-color: hsl(214 91% 35%);
		box-shadow: inset 0 0 0 2px hsl(214 91% 35%);
	}
	.d-step-lbl {
		max-width: 100%;
		font-size: 0.5625rem;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: hsl(var(--muted-foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.d-step--done .d-step-lbl {
		color: hsl(var(--foreground) / 0.7);
	}
	.d-step--now .d-step-lbl {
		color: hsl(214 91% 32%);
		font-weight: 700;
	}
	/* The 22%/32% blues disappear against the dark surface. */
	:global(.dark) .d-step--done::after {
		background: hsl(214 91% 55%);
	}
	:global(.dark) .d-step--done .d-step-mark {
		border-color: hsl(214 91% 45%);
		background: hsl(214 91% 45%);
	}
	:global(.dark) .d-step--now .d-step-mark {
		border-color: hsl(214 91% 55%);
		box-shadow: inset 0 0 0 2px hsl(214 91% 55%);
	}
	:global(.dark) .d-step--now .d-step-lbl {
		color: hsl(214 91% 65%);
	}

	.d-stalled {
		font-size: 0.625rem;
		font-weight: 600;
		padding: 0.125rem 0.5rem;
		border-radius: 999px;
		background: hsl(38 92% 50% / 0.15);
		border: 1px solid hsl(38 92% 50% / 0.4);
		color: hsl(38 92% 32%);
	}

	.d-body {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 1rem 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.125rem;
	}
	/* Bordered meta grid — hairline cells, like the mockup's summary block. */
	.d-meta {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1px;
		background: hsl(var(--border));
		border: 1px solid hsl(var(--border));
		border-radius: 0.5rem;
		overflow: hidden;
		/* `overflow: hidden` zeroes this flex item's automatic minimum height,
		   so without this the grid is squeezed by `.d-body` and clips its last
		   row (classification + tags) instead of letting the pane scroll. */
		flex-shrink: 0;
	}
	.d-meta-cell {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		padding: 0.625rem 0.75rem;
		background: hsl(var(--card));
	}
	.d-meta-lbl {
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: hsl(var(--muted-foreground));
	}
	.d-meta-val {
		font-size: 0.8125rem;
		min-width: 0;
		/* Long customer names and classifications wrap inside the cell rather
		   than running past its edge — there is no nowrap here, so an ellipsis
		   would never have applied. */
		overflow-wrap: anywhere;
	}
	.d-meta-val--owner {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}
	.d-meta-dim {
		color: hsl(var(--muted-foreground));
	}
	.d-meta-hot {
		color: hsl(var(--destructive));
		font-weight: 600;
	}
	.d-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.d-section-title {
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: hsl(var(--muted-foreground));
	}
	/* Block-level so the chip row takes the cell's full width and wraps at it. */
	.d-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
	}
	.d-tag {
		font-size: 0.6875rem;
		padding: 0.125rem 0.5rem;
		border-radius: 999px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--muted) / 0.5);
	}

	/* Belongs to the stacked layout only; the wide split keeps both panes
	   on screen, so there is nothing to go back from. */
	.d-back {
		display: none;
		align-items: center;
		align-self: flex-start;
		gap: 0.25rem;
		flex-shrink: 0;
		/* Matches `.d-head`'s inline padding so it lines up with the title. */
		padding: 0.75rem 1.25rem 0;
		border: 0;
		background: none;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
	}
	.d-back:hover {
		color: hsl(var(--foreground));
	}

	/* ── Small screens ───────────────────────────────────────────────
	   The two-pane split cannot hold below this width: the detail pane's
	   380px floor squeezes the queue until the row's fixed tracks
	   (8.5rem + 9rem + 5.25rem ≈ 364px) no longer fit their column, and
	   the header labels and stage text overlap. Collapse to one column,
	   render the rows as stacked cards, and show a single pane at a
	   time. */
	@media (max-width: 63.9375rem) {
		.ov-split {
			grid-template-columns: minmax(0, 1fr);
		}

		/* Queue until a case is picked, detail once one is — with the back
		   button above as the way out. */
		.ov-split--detail .ov-queue {
			display: none;
		}
		.ov-split:not(.ov-split--detail) .ov-detail {
			display: none;
		}

		.ov-queue {
			border-right: none;
		}

		/* The header describes column tracks that no longer exist, so it
		   degrades to a plain row of sort controls. Keeping it (rather than
		   hiding it) is what preserves sorting on small screens. */
		.q-head {
			display: flex;
			flex-wrap: wrap;
			height: auto;
			gap: 0.25rem 0.875rem;
			padding: 0.4375rem 0.875rem;
		}
		.q-col-age {
			text-align: left;
		}

		/* Card rows: the case block gets a line to itself, the rest share
		   the next one with age pushed to the end. */
		.q-row {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.375rem 0.75rem;
		}
		.q-cell-case {
			flex: 1 0 100%;
		}
		.q-cell-stage {
			/* Enough basis for the pipeline segments, which are `flex: 1` and
			   would otherwise collapse to nothing. */
			flex: 0 1 auto;
			min-width: 6rem;
		}
		.q-cell-owner {
			flex: 0 1 auto;
		}
		.q-cell-age {
			flex: 0 0 auto;
			margin-left: auto;
			text-align: right;
		}

		.d-back {
			display: inline-flex;
		}
	}
</style>

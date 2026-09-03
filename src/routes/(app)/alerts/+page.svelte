<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import {
		ArrowDownNarrowWide,
		ArrowUpNarrowWide,
		ChevronDownIcon,
		TrashIcon
	} from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getTotal, isFiniteNumberString, toApiDate } from '$lib/utils';
	import type { Alert } from '$lib/types/resources/alert';
	import { DEFAULT_ITEMS_PER_PAGE } from '$lib/config/api.config';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import {
		COMMENTS_PANEL_CTX,
		type CommentsPanelContext
	} from '$lib/contexts/comments-panel.context.svelte';
	import {
		INVESTIGATION_FLOW_PANEL_CTX,
		type InvestigationFlowPanelContext
	} from '$lib/contexts/investigation-flow-panel.context.svelte';
	import type { RequestResponse, Paginated } from '$lib/services/api.service';
	import type {
		CreateAlertBody,
		FilterAlertsParams,
		UpdateAlertBody
	} from '$lib/services/alerts.service';
	import { toast } from '$lib/components/ui/toast';
	import type { AlertQueueUnit } from '$lib/types/resources/alert-queue-unit';
	import { pruneAlertQueueUnits, replaceAlertInQueueUnits } from '$lib/utils/alert-queue';
	import {
		AlertResolutionService,
		type AlertResolution
	} from '$lib/services/alert-resolutions.service';
	import { AlertStatusService, type AlertStatus } from '$lib/services/alert-status.service';
	import {
		CaseClassificationsService,
		type CaseClassification
	} from '$lib/services/case-classifications.service';
	import { SeveritiesService, type Severity } from '$lib/services/severities.service';
	import { CustomersService, type Customer } from '$lib/services/customers.service';
	import { UsersService, type MentionableUser } from '$lib/services/users.service';
	import AlertFilterLabels from './components/AlertFilters/AlertFilterLabels.svelte';
	import { auth, current_user } from '$lib/stores/auth.store';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import ConfirmationDialog from '$lib/components/ui/dialog/ConfirmationDialog.svelte';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuTrigger
	} from '$lib/components/ui/dropdown-menu';
	import { Loading } from '$lib/components/ui/loading';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import { SearchableSelect } from '$lib/components/ui/searchable-select';
	import {
		AlertFilters,
		defaultFilters,
		savedFilterToUiFilters,
		uiFiltersToSavedFilterData,
		type Filters
	} from './components/AlertFilters';
	import { AlertCard } from './components/AlertCard';
	import {
		AlertsBoard,
		AlertsViewSwitcher,
		isAlertBoardGroup,
		isAlertViewMode,
		UNASSIGNED_OWNER_ID,
		type AlertBoardGroup,
		type AlertViewMode
	} from './components/AlertsBoard';
	import { AlertsSplitView } from './components/AlertsSplitView';
	import AlertHistoryDialog from './components/alert-history-dialog.svelte';
	import AlertsPagination from './components/alerts-pagination.svelte';
	import AlertsReasignDialog from './components/alerts-reasign-dialog.svelte';
	import AlertsCloseDialog from './components/alerts-close-dialog.svelte';
	import AlertEditDialog from './components/alert-edit-dialog.svelte';
	import AlertCreateDialog from './components/alert-create-dialog.svelte';
	import AlertsMergeDialog, {
		type MergeAlertPayload,
		type MergeMode
	} from './components/alerts-merge-dialog.svelte';
	import {
		ALERTS_DEFAULT_VIEW,
		loadAlertsDefaultView,
		openAlertsCondition,
		type AlertsDefaultView
	} from '$lib/utils/alerts-default-view';
	import type { SavedFilter } from '$lib/services/alerts-filters.service';
	import { buildDefaultAlertFilters } from './helpers/alerts-default-view';
	import { mergeAlerts } from './helpers/alerts-merge';
	import { closeAlerts } from './helpers/alerts-close';
	import { assignAlertsToOwner, reassignAlertOwner } from './helpers/alerts-assign';
	import { unlinkAlertCase } from './helpers/alert-unlink';
	import {
		parseAlertSort,
		toggleAlertSort,
		type AlertSortColumn
	} from './helpers/alert-queue-columns';

	type QueryState = {
		page: number;
		per_page: number;
		expanded: boolean;
		/** `list` = the paginated alert cards, `board` = the triage kanban. */
		view: AlertViewMode;
		/** Which lookup the board lays its columns out by. Ignored in list view. */
		board_group: AlertBoardGroup;
		filters: Filters;
	};

	type FilterKey = keyof Filters;

	const FILTER_KEYS: readonly FilterKey[] = [
		'alert_title',
		'alert_description',
		'alert_source',
		'alert_tags',
		'alert_status_id',
		'alert_severity_id',
		'alert_classification_id',
		'alert_customer_id',
		'alert_start_date',
		'alert_end_date',
		'creation_start_date',
		'creation_end_date',
		'alert_assets',
		'alert_iocs',
		'alert_ids',
		'source_reference',
		'case_id',
		'cluster_id',
		'alert_owner_id',
		'resolution_status_id',
		'custom_conditions',
		'sort',
		'order_by'
	];

	let query = $state<QueryState>({
		page: 1,
		per_page: DEFAULT_ITEMS_PER_PAGE,
		expanded: false,
		view: 'split',
		board_group: 'severity',
		filters: defaultFilters()
	});

	const alerts = getContext<AlertsContext>(ALERTS_CTX);
	const cases = getContext<CasesContext>(CASES_CTX);
	const commentsPanel = getContext<CommentsPanelContext>(COMMENTS_PANEL_CTX);
	const investigationFlowPanel = getContext<InvestigationFlowPanelContext>(
		INVESTIGATION_FLOW_PANEL_CTX
	);

	let status = $state<'initial' | 'loading' | 'ready'>('initial');

	// The user's default view, resolved once per page load before the
	// first query goes out. Firing an unfiltered request and then
	// immediately superseding it would flash every alert in the instance
	// and waste the round-trip, so the effect below holds until
	// `defaultViewResolved` flips.
	let defaultView = $state<AlertsDefaultView>(ALERTS_DEFAULT_VIEW);
	let defaultViewPreset = $state<SavedFilter | null>(null);
	let defaultViewResolved = $state(false);

	let filtersOpen = $state(false);
	let selectedSavedFilterId = $state<string>('');
	let savingFilter = $state(false);

	let selecting = $state(false);
	let selectedAll = $state(false);
	let selected = $state<Record<number, boolean>>({});
	let expanded = $state<Record<number, boolean>>({});

	let alertsData = $state<Paginated<Alert>>({
		data: [],
		total: 0,
		current_page: 1,
		last_page: 1,
		next_page: null
	});

	// Split view only: the queue rows, with clustered alerts folded into
	// their cluster. `null` in every other view, where the flat
	// `alertsData` is the whole story.
	let alertGroups = $state<AlertQueueUnit[] | null>(null);
	// Number of queue units, which is what the split view pages over —
	// `alertsData.total` still counts alerts, for the heading.
	let groupTotal = $state(0);

	// Reported by the board so the heading count stays truthful when the
	// list view's own `alertsData.total` is stale (or never fetched).
	let boardTotal = $state(0);

	// Bumped by the shared Refresh button. The board watches it as a
	// plain reactive dependency, which keeps the refetch trigger in the
	// same `$effect` as the filter/grouping ones instead of needing a
	// `bind:this` handle just for this.
	let boardRefreshKey = $state(0);

	let alertResolutions = $state<AlertResolution[]>([]);
	let alertStatuses = $state<AlertStatus[]>([]);
	let caseClassifications = $state<CaseClassification[]>([]);
	let severities = $state<Severity[]>([]);
	let customers = $state<Customer[]>([]);
	let owners = $state<MentionableUser[]>([]);

	let reassignOpen = $state(false);
	let reassignAlert = $state<Alert | null>(null);
	let reassignOwnerId = $state<string>('');

	let showConfirmDelete = $state(false);
	let showConfirmDeletePreset = $state(false);

	let showAlertHistory = $state(false);
	let showAlertEdit = $state(false);
	let showAlertCreate = $state(false);
	let creatingAlert = $state(false);
	let showMerge = $state(false);
	// Which half of the merge dialog to land on: "Escalate" opens a new
	// case, "Merge" folds the alerts into an existing one.
	let mergeMode = $state<MergeMode>('new');
	let showClose = $state(false);

	const perPageOptions = [5, 10, 25, 50, 100, 200, 500].map((n) => ({
		value: String(n),
		label: `${n} entries`
	}));

	/**
	 * Which quick-filter tab the split cockpit shows as active.
	 *
	 * Derived from the current `alert_owner_id` filter:
	 *   • current user id  → 'mine'
	 *   • -1 (UNASSIGNED)  → 'unassigned'
	 *   • anything else    → null  (All open)
	 *
	 * 'escalated' is not yet a distinct filter in the current API; the
	 * tab is wired but maps to null until escalated-status filtering is
	 * added to FilterAlertsParams.
	 */
	const queueTab = $derived.by((): 'mine' | 'unassigned' | 'escalated' | null => {
		const ownerId = query.filters.alert_owner_id;
		if (ownerId != null && ownerId === $current_user?.id) return 'mine';
		if (ownerId === UNASSIGNED_OWNER_ID) return 'unassigned';
		// Escalated tab: a single status_id matching the escalated status
		const escalatedStatus = alertStatuses.find((s) => s.status_name.toLowerCase() === 'escalated');
		if (
			escalatedStatus &&
			query.filters.alert_status_id === escalatedStatus.status_id &&
			ownerId == null
		)
			return 'escalated';
		return null;
	});

	const changeQueueTab = (tab: 'mine' | 'unassigned' | 'escalated' | null) => {
		let alert_owner_id: number | undefined;
		let alert_status_id: number | undefined;
		let custom_conditions: string | undefined;

		if (tab === 'mine') alert_owner_id = $current_user?.id ?? undefined;
		else if (tab === 'unassigned') alert_owner_id = UNASSIGNED_OWNER_ID;
		// else: All open — no owner filter

		if (tab === 'escalated') {
			const escalatedStatus = alertStatuses.find(
				(s) => s.status_name.toLowerCase() === 'escalated'
			);
			if (escalatedStatus) alert_status_id = escalatedStatus.status_id;
		} else {
			// For all other tabs, exclude terminal statuses — the same
			// "open" scope the per-user default view builds on.
			custom_conditions = openAlertsCondition(alertStatuses);
		}

		void commitQuery({
			...query,
			page: 1,
			filters: {
				...query.filters,
				alert_owner_id,
				alert_status_id,
				custom_conditions
			}
		});
	};

	const normalizeAlert = (value: unknown): Alert => {
		if (!value || typeof value !== 'object') return {} as Alert;

		return value as Alert;
	};

	const readQueryFromUrl = (url: URL): QueryState => {
		const filters = defaultFilters();

		for (const key of FILTER_KEYS) {
			const raw = url.searchParams.get(key);
			if (raw == null || raw.trim() === '') continue;

			if (
				key === 'alert_status_id' ||
				key === 'alert_severity_id' ||
				key === 'alert_classification_id' ||
				key === 'alert_customer_id' ||
				key === 'case_id' ||
				key === 'cluster_id' ||
				key === 'alert_owner_id' ||
				key === 'resolution_status_id'
			) {
				if (isFiniteNumberString(raw)) {
					(filters as Record<FilterKey, unknown>)[key] = Number(raw);
				}
				continue;
			}

			(filters as Record<FilterKey, unknown>)[key] = raw;
		}

		const pageRaw = Number(url.searchParams.get('page') ?? '1');
		const perPageRaw = Number(url.searchParams.get('per_page') ?? String(DEFAULT_ITEMS_PER_PAGE));

		const viewRaw = url.searchParams.get('view');
		const groupRaw = url.searchParams.get('board_group');

		return {
			page: Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
			per_page:
				Number.isFinite(perPageRaw) && perPageRaw >= 1 ? perPageRaw : DEFAULT_ITEMS_PER_PAGE,
			expanded: url.searchParams.get('expanded') === '1',
			view: isAlertViewMode(viewRaw) ? viewRaw : 'split',
			board_group: isAlertBoardGroup(groupRaw) ? groupRaw : 'severity',
			filters
		};
	};

	/**
	 * Whether the URL already names a view of its own.
	 *
	 * `sort` counts: the page writes it on every commit, so its presence
	 * marks a URL this page (or a bookmark of one) produced — including
	 * the deliberately empty one left behind by "Clear". Only a bare
	 * `/alerts`, which is what the side-bar entry links to, is treated
	 * as "no view chosen" and gets the user's default applied.
	 */
	const urlCarriesFilters = (url: URL) => FILTER_KEYS.some((key) => url.searchParams.has(key));

	/** Resolves to whether a navigation was actually issued. */
	const writeQueryToUrl = async (queryState: QueryState): Promise<boolean> => {
		const url = new URL(window.location.href);

		if (queryState.page <= 1) url.searchParams.delete('page');
		else url.searchParams.set('page', String(queryState.page));

		if (queryState.per_page === DEFAULT_ITEMS_PER_PAGE) url.searchParams.delete('per_page');
		else url.searchParams.set('per_page', String(queryState.per_page));

		if (queryState.expanded) url.searchParams.set('expanded', '1');
		else url.searchParams.delete('expanded');

		if (queryState.view === 'board') url.searchParams.set('view', 'board');
		else if (queryState.view === 'list') url.searchParams.set('view', 'list');
		else url.searchParams.delete('view'); // 'split' is the default — no param needed

		// Only meaningful alongside `view=board`; keeping it out of the URL
		// otherwise stops a stale grouping from riding along on a shared
		// list-view link.
		if (queryState.view === 'board' && queryState.board_group !== 'severity') {
			url.searchParams.set('board_group', queryState.board_group);
		} else {
			url.searchParams.delete('board_group');
		}

		for (const key of FILTER_KEYS) {
			const raw = queryState.filters[key];

			if (raw == null) {
				url.searchParams.delete(key);
				continue;
			}

			if (typeof raw === 'number') {
				if (!Number.isFinite(raw)) url.searchParams.delete(key);
				else url.searchParams.set(key, String(raw));
				continue;
			}

			const value = String(raw).trim();
			if (value === '') url.searchParams.delete(key);
			else url.searchParams.set(key, value);
		}

		const nextHref = `${url.pathname}${url.search}`;
		const currentHref = `${window.location.pathname}${window.location.search}`;
		if (nextHref === currentHref) return false;

		await goto(nextHref, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});

		return true;
	};

	const loadAlerts = async (next: QueryState) => {
		// The board scopes and pages its own query (unassigned-only,
		// terminal statuses excluded, every page up front), so the list
		// request would be dead weight while it is on screen.
		if (next.view === 'board') {
			status = 'ready';
			return;
		}

		status = 'loading';

		// An order the queue cannot draw a header caret for is not one it
		// should ask the server for either — otherwise a hand-edited
		// `order_by` sorts the rows one way while the headers claim another.
		const sort = parseAlertSort(next.filters.order_by, next.filters.sort);

		const params = {
			...next.filters,
			order_by: sort.column,
			sort: sort.dir,
			alert_start_date: toApiDate(next.filters.alert_start_date),
			alert_end_date: toApiDate(next.filters.alert_end_date, true),
			creation_start_date: toApiDate(next.filters.creation_start_date),
			creation_end_date: toApiDate(next.filters.creation_end_date, true),
			page: next.page,
			per_page: next.per_page
		};

		try {
			// The split view's queue lists a cluster as one entry with its
			// alerts inside it, so it pages over *units* and needs the
			// grouped endpoint. The list view still wants a flat page.
			if (next.view === 'split') {
				await loadAlertGroups(params);
				return;
			}

			alertGroups = null;

			const response = await alerts.listPaginated(params);

			const raw = response.data as Paginated<Alert>;
			const list = Array.isArray(raw.data) ? raw.data : [];

			alertsData = {
				...raw,
				data: list.map(normalizeAlert)
			};
		} finally {
			status = 'ready';
		}
	};

	const loadAlertGroups = async (params: FilterAlertsParams) => {
		const grouped = await alerts.listGroupedPaginated(params);

		// A failed request empties the queue rather than leaving the previous
		// page on screen, so nothing can be acted on that the server did not
		// just confirm.
		if (!grouped) {
			alertGroups = [];
			groupTotal = 0;
			alertsData = { data: [], total: 0, current_page: 1, last_page: 1, next_page: null };
			return;
		}

		alertGroups = grouped.units;

		// `alertsData` stays the flat, de-duplicated page so selection,
		// bulk actions and the "N Alerts" heading keep working untouched.
		// Only the pager reads `groupTotal`, because that is the one number
		// that counts units instead of alerts.
		groupTotal = grouped.totalUnits;
		alertsData = grouped.page;
	};

	const commitQuery = async (nextQuery: QueryState) => {
		if (status === 'loading') return;

		query = nextQuery;
		writeQueryToUrl(nextQuery);

		if (status !== 'initial') {
			status = 'loading';
		}

		try {
			await loadAlerts(nextQuery);
		} finally {
			status = 'ready';
		}
	};

	const refreshAlerts = async () => loadAlerts(query);

	const refreshCurrentView = () => {
		if (query.view === 'board') {
			boardRefreshKey += 1;
			return;
		}

		void refreshAlerts();
	};

	const changeView = (view: AlertViewMode) => {
		if (view === query.view) return;

		// Bulk selection is a list-view affordance; carrying it into the
		// board or split view would leave the action bar orphaned.
		cancelSelect();

		void commitQuery({
			...query,
			page: 1,
			view
		});
	};

	const changeBoardGroup = (board_group: AlertBoardGroup) => {
		if (board_group === query.board_group) return;

		void commitQuery({
			...query,
			board_group
		});
	};

	const changePage = (page: number) => {
		if (status === 'loading') return;

		void commitQuery({
			...query,
			page
		});
	};

	const activeSort = $derived(parseAlertSort(query.filters.order_by, query.filters.sort));

	/**
	 * Re-order the queue. Ordering is a server-side concern (`order_by` +
	 * `sort`), so the page has to go back to 1 — the rows that were on it
	 * are not the rows that come first any more.
	 */
	const toggleSort = async (column: AlertSortColumn) => {
		const next = toggleAlertSort(activeSort, column);

		await commitQuery({
			...query,
			page: 1,
			filters: { ...query.filters, order_by: next.column, sort: next.dir }
		});
	};

	const applyUpdatedAlert = (updated: Alert) => {
		const alertsList = Array.isArray(alertsData.data) ? alertsData.data : [];

		alertsData = {
			...alertsData,
			data: alertsList.map((alert) => (alert.alert_id === updated.alert_id ? updated : alert))
		};

		// Same reason as in `applyRemovedAlerts`: the split view's rows come
		// from `alertGroups`, so patching only the flat page would leave the
		// queue showing the old status until a reload.
		if (alertGroups) alertGroups = replaceAlertInQueueUnits(alertGroups, updated);

		if (reassignAlert?.alert_id === updated.alert_id) {
			reassignAlert = updated;
			reassignOwnerId = String(updated.alert_owner_id ?? '');
		}
	};

	const applyRemovedAlerts = (ids: number[]) => {
		const idSet = new Set(ids);
		const alertsList = Array.isArray(alertsData.data) ? alertsData.data : [];
		const nextAlerts = alertsList.filter((alert) => !idSet.has(alert.alert_id));
		const nextTotal = Math.max(0, (alertsData.total ?? 0) - ids.length);

		alertsData = {
			...alertsData,
			data: nextAlerts,
			total: nextTotal
		};

		// The split view renders `alertGroups`, not `alertsData`, so deleted
		// alerts would otherwise sit in the queue until the next reload.
		if (alertGroups) {
			const { units, removedUnits } = pruneAlertQueueUnits(alertGroups, idSet);
			alertGroups = units;
			groupTotal = Math.max(0, groupTotal - removedUnits);
		}
	};

	const getPagesCount = (): number => {
		const total = typeof alertsData.total === 'number' ? alertsData.total : 0;
		if (total <= 0) return 1;
		return Math.ceil(total / query.per_page);
	};

	const getAlertFromPage = (id: number): Alert | null => {
		for (const alert of alertsData.data) {
			if (alert.alert_id === id) return alert;
		}

		return null;
	};

	const getSelectedAlertIds = (): number[] => {
		if (selectedAll) {
			return alerts.list.ids;
		}

		const ids: number[] = [];

		for (const alertId in selected) {
			if (selected[alertId]) {
				ids.push(Number(alertId));
			}
		}

		return ids;
	};

	const getSelectedCount = (): number => getSelectedAlertIds().length;

	const applySavedFilter = async (id: number) => {
		const saved = await alerts.getSavedFilter(id);
		if (!saved) return;

		selectedSavedFilterId = String(id);

		const nextFilters = savedFilterToUiFilters(saved, defaultFilters());

		await commitQuery({
			...query,
			page: 1,
			filters: nextFilters
		});
	};

	const clearSavedFilterSelection = () => (selectedSavedFilterId = '');

	// The selected preset — resolved from the live list so the trash
	// affordance and its ownership check reflect the latest server
	// state (name change, ownership transfer, etc.).
	const selectedSavedFilter = $derived(
		selectedSavedFilterId === ''
			? null
			: (alerts.savedFilters.items.find((f) => String(f.filter_id) === selectedSavedFilterId) ??
					null)
	);

	// Only surface the delete button when the current user created the
	// preset; the backend rejects deletes from anyone else anyway, but
	// hiding the affordance avoids a confusing failure state.
	const canDeleteSelectedFilter = $derived(
		selectedSavedFilter !== null &&
			$current_user?.id != null &&
			selectedSavedFilter.created_by === $current_user.id
	);

	const deleteSelectedSavedFilter = async () => {
		if (!selectedSavedFilter) {
			showConfirmDeletePreset = false;
			return;
		}

		const removed = await alerts.removeSavedFilter(selectedSavedFilter.filter_id);

		showConfirmDeletePreset = false;

		if (removed) {
			clearSavedFilterSelection();
		}
	};

	const saveAsFilter = async (
		current: Filters,
		meta: { name: string; description: string; isPrivate: boolean }
	) => {
		if (savingFilter) return;

		const name = meta.name.trim();
		if (name === '') return;

		savingFilter = true;

		const created = await alerts.createSavedFilter({
			filter_is_private: meta.isPrivate,
			filter_type: 'alerts',
			filter_name: name,
			filter_description: meta.description.trim(),
			filter_data: [uiFiltersToSavedFilterData(current)]
		});

		savingFilter = false;

		if (!created) return;

		selectedSavedFilterId = String(created.filter_id);
	};

	const openReassignDialog = (alert?: Alert) => {
		if (alert) {
			reassignAlert = alert;
			reassignOwnerId = String(alert.alert_owner_id);
		}

		reassignOpen = true;
	};

	const closeReassignDialog = () => {
		reassignOpen = false;
		reassignAlert = null;
		reassignOwnerId = '';
	};

	const cancelSelect = () => {
		selecting = false;
		selectedAll = false;
		selected = {};
	};

	const updateAlert = async (alert_id: number, changes: UpdateAlertBody): Promise<Alert | null> => {
		const updated = await alerts.patch(alert_id, changes);

		if (updated) {
			applyUpdatedAlert(updated);
		}

		return updated;
	};

	const createAlert = async (body: CreateAlertBody) => {
		creatingAlert = true;

		try {
			const created = await alerts.create(body);

			if (!created) {
				// The API is the authority on who may write alerts for
				// which customer, so a refusal lands here rather than
				// being second-guessed by hiding the button.
				toast({
					title: 'Failed to create the alert',
					description: 'Check that you have write access for the selected customer.',
					variant: 'destructive'
				});
				return;
			}

			showAlertCreate = false;

			toast({ title: `Alert #${created.alert_id} created` });

			// Re-query rather than splicing the new alert in: it may not
			// belong in the current filter, page or board column at all,
			// and a row that vanishes on the next refresh is worse than
			// one that never appeared.
			refreshCurrentView();
		} finally {
			creatingAlert = false;
		}
	};

	const confirmReassign = async () => {
		if (!reassignAlert) return;

		const updated = await reassignAlertOwner({ updateAlert }, reassignAlert.alert_id, {
			ownerId: reassignOwnerId
		});

		if (!updated) {
			await refreshAlerts();
		}

		closeReassignDialog();
		cancelSelect();
	};

	const assignToCurrentUser = async (alert: Alert) => {
		const nextOwnerId = $current_user?.id;

		const [updated] = await assignAlertsToOwner({ updateAlert }, [alert.alert_id], nextOwnerId);
		if (!updated) {
			await refreshAlerts();
		}
	};

	const assign = async (alert: Alert) => {
		if (!$current_user) return;

		if (alert.alert_owner_id) {
			openReassignDialog(alert);
			return;
		}

		await assignToCurrentUser(alert);
	};

	const setStatus = async (alert_status_id: number) => {
		const updates = await Promise.all(
			getSelectedAlertIds().map((alert_id) => updateAlert(alert_id, { alert_status_id }))
		);

		if (updates.some((updated) => !updated)) {
			await refreshAlerts();
		}

		cancelSelect();
	};

	const confirmMergeAlerts = async (mergeAlertPayload: MergeAlertPayload) => {
		const updatedCaseId = await mergeAlerts(
			{ alerts, cases },
			getSelectedAlertIds(),
			mergeAlertPayload
		);

		if (updatedCaseId) {
			await refreshAlerts();
		}

		showMerge = false;

		cancelSelect();
	};

	const closeWithNote = async (changes: UpdateAlertBody) => {
		const updates = await closeAlerts(
			{ updateAlert },
			getSelectedAlertIds(),
			alertStatuses,
			changes
		);

		if (updates.some((updated) => !updated)) {
			await refreshAlerts();
		}

		showClose = false;

		cancelSelect();
	};

	const unlinkCase = async (case_id: number) => {
		const updates = await unlinkAlertCase({ updateAlert }, selectedAlert, case_id);

		if (updates) {
			await refreshAlerts();
		}

		cancelSelect();
	};

	const deleteSelected = async () => {
		const alertIds = getSelectedAlertIds();

		if (!alertIds.length) {
			showConfirmDelete = false;
			return;
		}

		const results = await Promise.all(alertIds.map((alertId) => alerts.remove(alertId)));
		const deletedIds = alertIds.filter((_, index) => results[index]);

		if (deletedIds.length) {
			applyRemovedAlerts(deletedIds);
		}

		showConfirmDelete = false;
		cancelSelect();

		if (alertsData.data.length === 0 && query.page > 1) {
			await commitQuery({
				...query,
				page: query.page - 1
			});

			return;
		}

		if (deletedIds.length !== alertIds.length) {
			await refreshAlerts();
		}
	};

	let selectedAlertId = $derived(getSelectedAlertIds()[0] ?? 0);
	let selectedAlert = $derived(
		getAlertFromPage(selectedAlertId) ?? alerts.byId[selectedAlertId] ?? null
	);

	const removeFilter = async (key: keyof Filters) => {
		clearSavedFilterSelection();

		await commitQuery({
			...query,
			page: 1,
			filters: {
				...query.filters,
				[key]: undefined
			}
		});
	};

	$effect(() => {
		const url = new URL(page.url);
		const nextQuery = readQueryFromUrl(url);

		// Nothing is fetched until the default view is known — see the
		// declaration of `defaultViewResolved`. The query still lands so
		// the toolbar renders against the URL rather than against stale
		// state once the spinner clears.
		if (!defaultViewResolved) {
			query = nextQuery;
			return;
		}

		if (!urlCarriesFilters(url)) {
			const next = {
				...nextQuery,
				page: 1,
				filters: buildDefaultAlertFilters(defaultView, {
					alertStatuses,
					currentUserId: $current_user?.id,
					preset: defaultViewPreset
				})
			};

			query = next;

			// A preset default is still a preset: name it in the toolbar
			// so the chips, the delete affordance and the dropdown agree
			// with what the queue is actually showing.
			if (defaultView.mode === 'preset' && defaultViewPreset) {
				selectedSavedFilterId = String(defaultViewPreset.filter_id);
			}

			// Writing the URL re-enters this effect, and *that* pass does
			// the loading: going through `commitQuery` here would fetch
			// once now and once again on the resulting navigation. If the
			// href happens not to change there is no second pass, so load
			// directly instead.
			void (async () => {
				const navigated = await writeQueryToUrl(next);
				if (!navigated) await loadAlerts(next);
			})();

			return;
		}

		query = nextQuery;

		void loadAlerts(nextQuery);
	});

	onMount(async () => {
		// The status lookup and the default-view preference gate the
		// first alerts query, so they are fetched together and up front;
		// every other lookup only feeds the filter panel and can follow.
		try {
			const [alertStatusResult, storedView] = await Promise.all([
				AlertStatusService.list(),
				loadAlertsDefaultView()
			]);

			const alertStatusResponse = alertStatusResult.data as unknown as RequestResponse<
				AlertStatus[]
			>;

			alertStatuses = (alertStatusResponse?.data ?? []) as AlertStatus[];

			defaultView = storedView;

			// `mine` needs an id, and on a hard reload straight onto
			// /alerts the layout's whoami may still be in flight. This
			// shares that in-flight call rather than issuing a second
			// one, and returns immediately once it has landed.
			if (storedView.mode === 'mine' && $current_user?.id == null) {
				await auth.loadAuth(fetch);
			}

			if (storedView.mode === 'preset' && storedView.filter_id != null) {
				// A preset the user has since lost access to (or deleted)
				// resolves to null; `buildDefaultAlertFilters` then falls
				// back to an unfiltered view rather than an empty one.
				defaultViewPreset = await alerts.getSavedFilter(storedView.filter_id);
			}
		} finally {
			// Even a failed lookup has to release the gate, or the page
			// would sit on the spinner forever.
			defaultViewResolved = true;
		}

		const alertResolutionResponse = (await AlertResolutionService.list())
			.data as unknown as RequestResponse<AlertResolution[]>;

		alertResolutions = alertResolutionResponse.data as AlertResolution[];

		const caseClassificationsResponse = (await CaseClassificationsService.list())
			.data as unknown as RequestResponse<CaseClassification[]>;

		caseClassifications = caseClassificationsResponse.data as CaseClassification[];

		const severitiesResponse = (await SeveritiesService.list()).data as unknown as RequestResponse<
			Severity[]
		>;

		severities = severitiesResponse.data as Severity[];

		const customersResponse = await CustomersService.list();

		customers = customersResponse.data;

		const mentionableResponse = await UsersService.listMentionable();
		const mentionable = (mentionableResponse?.data as { data?: MentionableUser[] })?.data;

		owners = Array.isArray(mentionable)
			? mentionable
			: Array.isArray(mentionableResponse?.data)
				? (mentionableResponse.data as unknown as MentionableUser[])
				: [];

		await alerts.loadSavedFilters();
	});
</script>

<svelte:head>
	<title>Alerts</title>
</svelte:head>

<!--
  The bulk-action buttons, defined once and rendered by both the list
  view and the split view's selection bar. Sharing the snippet rather
  than copying the markup is what keeps "same as the list view" true
  as these actions change.
-->
{#snippet bulkActions()}
	<Button
		variant="outline"
		size="xs"
		onclick={() => {
			mergeMode = 'new';
			showMerge = true;
		}}>Escalate</Button
	>

	<Button
		variant="outline"
		size="xs"
		onclick={() => {
			mergeMode = 'existing';
			showMerge = true;
		}}>Merge</Button
	>

	<DropdownMenu>
		<DropdownMenuTrigger>
			<Button variant="outline" size="xs">
				Assign
				<ChevronDownIcon size="14" />
			</Button>
		</DropdownMenuTrigger>

		<DropdownMenuContent align="end">
			<DropdownMenuItem
				onclick={async () => {
					const updates = await Promise.all(
						getSelectedAlertIds()
							.map((alertId) => getAlertFromPage(alertId))
							.filter((alert): alert is Alert => alert !== null)
							.map((alert) => assignToCurrentUser(alert))
					);

					if (updates.length === 0) {
						await refreshAlerts();
					}

					cancelSelect();
				}}>Assign to me</DropdownMenuItem
			>

			<DropdownMenuItem
				onclick={() =>
					openReassignDialog(
						getSelectedAlertIds().length === 1
							? (getAlertFromPage(getSelectedAlertIds()[0]) ?? undefined)
							: undefined
					)}>Assign</DropdownMenuItem
			>
		</DropdownMenuContent>
	</DropdownMenu>

	<DropdownMenu>
		<DropdownMenuTrigger>
			<Button variant="outline" size="xs">
				Set status
				<ChevronDownIcon size="14" />
			</Button>
		</DropdownMenuTrigger>

		<DropdownMenuContent align="end">
			{#each alertStatuses as alertStatus}
				<DropdownMenuItem onclick={() => setStatus(alertStatus.status_id)}>
					{alertStatus.status_name}</DropdownMenuItem
				>
			{/each}
		</DropdownMenuContent>
	</DropdownMenu>

	<Button variant="destructive" size="xs" onclick={() => (showClose = true)}>Close with note</Button
	>

	<Button variant="destructive" size="xs" onclick={() => (showConfirmDelete = true)}
		><TrashIcon /> Delete</Button
	>
{/snippet}

<!--
  Page layout: the outer container is height-bounded so the alert list
  can scroll on its own (`min-h-0 overflow-hidden`). The header /
  filter strip / bulk-action bar / pagination all live in a
  `shrink-0` section above the scrollable `<ul>` — the header stays
  put while the user scrolls through alerts. The comments side panel
  (mounted in the alerts +layout.svelte) sits as a sibling outside of
  this scrolling region and stays full-height alongside.
-->
<div
	class="mx-auto flex h-full min-h-0 w-full grow flex-col overflow-hidden"
	class:max-w-9xl={query.view !== 'split'}
	class:p-6={query.view !== 'split'}
	class:pb-0={query.view !== 'split'}
>
	{#if status === 'initial'}
		<div class="flex h-full w-full items-center justify-center">
			<Loading size={32} />
		</div>
	{:else if query.view === 'split'}
		<!-- Split view: same toolbar as list/board, cockpit fills the remaining space -->
		<div class:opacity-60={status === 'loading'} class="flex min-h-0 grow flex-col gap-3 px-6 pt-6">
			<div class="flex shrink-0 items-center justify-between gap-4">
				<div class="flex items-center gap-3">
					<h2 class="whitespace-nowrap text-lg font-semibold">
						{getTotal({ data: alertsData } as RequestResponse<Paginated<Alert>>)} Alerts
					</h2>

					<Button
						size="xs"
						variant={filtersOpen ? 'default' : 'outline'}
						onclick={() => (filtersOpen = !filtersOpen)}
					>
						Filter
					</Button>

					{#if alerts.savedFilters.items.length}
						<div class="flex items-center gap-1">
							<div
								class="w-48 [&_button[role=combobox]]:!h-7 [&_button[role=combobox]]:!rounded-md [&_button[role=combobox]]:!px-2.5 [&_button[role=combobox]]:!py-0 [&_button[role=combobox]]:!text-xs [&_button[role=combobox]]:!font-normal"
							>
								<SearchableSelect
									value={selectedSavedFilterId}
									placeholder="Select preset filter"
									searchPlaceholder="Search preset filters..."
									emptyMessage="No preset filters found."
									items={alerts.savedFilters.items.map((filter) => ({
										value: String(filter.filter_id),
										label: filter.filter_name
									}))}
									onValueChange={(v) => {
										if (v === '') {
											clearSavedFilterSelection();
											return;
										}
										selectedSavedFilterId = v;
										const id = Number(v);
										if (!Number.isFinite(id)) return;
										applySavedFilter(id);
									}}
								/>
							</div>

							{#if canDeleteSelectedFilter}
								<Button
									variant="outline"
									size="xs"
									title="Delete preset filter"
									aria-label="Delete preset filter"
									onclick={() => (showConfirmDeletePreset = true)}
								>
									<TrashIcon class="h-4 w-4" />
								</Button>
							{/if}
						</div>
					{/if}
				</div>

				<div class="flex items-center gap-2">
					<Button size="xs" onclick={() => (showAlertCreate = true)}>New alert</Button>

					<Button
						variant="outline"
						size="xs"
						onclick={refreshCurrentView}
						disabled={status === 'loading'}
					>
						Refresh
					</Button>

					<AlertsViewSwitcher
						view={query.view}
						group={query.board_group}
						onViewChange={changeView}
						onGroupChange={changeBoardGroup}
					/>
				</div>
			</div>

			{#if filtersOpen}
				<AlertFilters
					value={query.filters}
					onChange={(next) => {
						query = { ...query, filters: next };
					}}
					onApply={() => {
						filtersOpen = false;
						commitQuery({ ...query, page: 1 });
					}}
					onClear={() => {
						filtersOpen = false;
						clearSavedFilterSelection();
						commitQuery({ ...query, page: 1, filters: defaultFilters() });
					}}
					presets={alerts.savedFilters.items}
					onSaveAsFilter={saveAsFilter}
					saving={savingFilter}
					{alertResolutions}
					{alertStatuses}
					{caseClassifications}
					{severities}
					{customers}
					{owners}
				/>
			{/if}

			<AlertsSplitView
				class="-mx-6 min-h-0 grow"
				alerts={alertsData.data}
				groups={alertGroups}
				loading={status === 'loading'}
				total={groupTotal}
				page={query.page}
				perPage={query.per_page}
				{selected}
				sort={activeSort}
				shortcutsEnabled={!showMerge &&
					!showClose &&
					!showAlertEdit &&
					!showAlertHistory &&
					!showConfirmDelete &&
					!reassignOpen}
				onToggleSort={toggleSort}
				onSelect={(alert_id, checked) => (selected = { ...selected, [alert_id]: checked })}
				onSelectMany={(alertIds, checked) => {
					const next = { ...selected };
					for (const alertId of alertIds) next[alertId] = checked;
					selected = next;
				}}
				onSelectAll={(checked) => {
					selectedAll = checked;
					selected = Object.fromEntries(alertsData.data.map((alert) => [alert.alert_id, checked]));
				}}
				onEscalate={(alert) => {
					selected = { ...selected, [alert.alert_id]: true };
					mergeMode = 'new';
					showMerge = true;
				}}
				onMerge={(alert) => {
					selected = { ...selected, [alert.alert_id]: true };
					mergeMode = 'existing';
					showMerge = true;
				}}
				onClose={(alert) => {
					selected = { ...selected, [alert.alert_id]: true };
					showClose = true;
				}}
				onOpenCluster={(cluster_id) => goto(`/alert-clusters/${cluster_id}`)}
				onPageChange={changePage}
				{queueTab}
				onQueueTabChange={changeQueueTab}
				onAssignToMe={assignToCurrentUser}
				onAssign={openReassignDialog}
			>
				{#snippet filterBar()}
					<AlertFilterLabels
						value={query.filters}
						onRemove={(key) => void removeFilter(key)}
						{alertResolutions}
						{alertStatuses}
						{caseClassifications}
						{severities}
						{customers}
						{owners}
					/>
				{/snippet}

				{#snippet selectionBar()}
					{@render bulkActions()}
				{/snippet}
			</AlertsSplitView>
		</div>
	{:else}
		<div class:opacity-60={status === 'loading'} class="flex min-h-0 grow flex-col gap-5">
			<!--
			  Fixed header strip: title, filter toggle / saved-filter
			  selector, action buttons, filter panel, applied-filter
			  labels, bulk-action bar, and top pagination all stay
			  pinned while the alert list below scrolls.
			-->
			<div class="flex shrink-0 flex-col gap-5">
				<div class="flex items-center justify-between gap-4">
					<div class="flex items-center gap-3">
						<h2 class="whitespace-nowrap text-lg font-semibold">
							{query.view === 'board'
								? boardTotal
								: getTotal({ data: alertsData } as RequestResponse<Paginated<Alert>>)} Alerts
						</h2>

						<Button
							size="xs"
							variant={filtersOpen ? 'default' : 'outline'}
							onclick={() => (filtersOpen = !filtersOpen)}
						>
							Filter
						</Button>

						{#if alerts.savedFilters.items.length}
							<div class="flex items-center gap-1">
								<div
									class="w-48 [&_button[role=combobox]]:!h-7 [&_button[role=combobox]]:!rounded-md [&_button[role=combobox]]:!px-2.5 [&_button[role=combobox]]:!py-0 [&_button[role=combobox]]:!text-xs [&_button[role=combobox]]:!font-normal"
								>
									<SearchableSelect
										value={selectedSavedFilterId}
										placeholder="Select preset filter"
										searchPlaceholder="Search preset filters..."
										emptyMessage="No preset filters found."
										items={alerts.savedFilters.items.map((filter) => ({
											value: String(filter.filter_id),
											label: filter.filter_name
										}))}
										onValueChange={(v) => {
											if (v === '') {
												clearSavedFilterSelection();
												return;
											}

											selectedSavedFilterId = v;

											const id = Number(v);
											if (!Number.isFinite(id)) return;

											applySavedFilter(id);
										}}
									/>
								</div>

								{#if canDeleteSelectedFilter}
									<Button
										variant="outline"
										size="xs"
										title="Delete preset filter"
										aria-label="Delete preset filter"
										onclick={() => (showConfirmDeletePreset = true)}
									>
										<TrashIcon class="h-4 w-4" />
									</Button>
								{/if}
							</div>
						{/if}
					</div>

					<div class="flex items-center gap-2">
						{#if query.view === 'list'}
							{#if selecting}
								<Button variant="outline" size="xs" onclick={cancelSelect}>Cancel</Button>

								<Button
									variant="outline"
									size="xs"
									onclick={() => {
										selected = {};
										selectedAll = true;
									}}>Select All</Button
								>
							{:else}
								<Button variant="outline" size="xs" onclick={() => (selecting = true)}
									>Select</Button
								>
							{/if}

							<Button
								variant="outline"
								size="xs"
								onclick={() => {
									expanded = {};

									commitQuery({
										...query,
										expanded: !query.expanded
									});
								}}
							>
								{query.expanded ? 'Collapse All' : 'Expand All'}
							</Button>
						{/if}

						<Button size="xs" onclick={() => (showAlertCreate = true)}>New alert</Button>

						<Button
							variant="outline"
							size="xs"
							onclick={refreshCurrentView}
							disabled={status === 'loading'}
						>
							Refresh
						</Button>

						{#if query.view === 'list'}
							<!-- The card list has no column headers to sort from, so it
							     keeps the newest/oldest toggle it has always had. -->
							<Button
								variant="outline"
								size="xs"
								onclick={() => toggleSort('event_time')}
								disabled={status === 'loading'}
							>
								{#if activeSort.column === 'event_time' && activeSort.dir === 'asc'}
									<ArrowDownNarrowWide class="h-4 w-4" />
								{:else}
									<ArrowUpNarrowWide class="h-4 w-4" />
								{/if}
							</Button>

							<Select
								value={String(query.per_page)}
								onValueChange={(value) => {
									const nextPerPage = Number(value);

									commitQuery({
										...query,
										page: 1,
										per_page: nextPerPage
									});
								}}
								type="single"
							>
								<SelectTrigger class="h-7 px-2.5 py-0"
									>{query.per_page} entries per page</SelectTrigger
								>

								<SelectContent>
									{#each perPageOptions as perPageOption}
										<SelectItem value={perPageOption.value}>{perPageOption.label}</SelectItem>
									{/each}
								</SelectContent>
							</Select>
						{/if}

						<AlertsViewSwitcher
							view={query.view}
							group={query.board_group}
							onViewChange={changeView}
							onGroupChange={changeBoardGroup}
						/>
					</div>
				</div>

				{#if query.view === 'list' && getPagesCount() > 1}
					<AlertsPagination page={query.page} pages={getPagesCount()} onPageChange={changePage} />
				{/if}

				{#if filtersOpen}
					<AlertFilters
						value={query.filters}
						onChange={(next) => {
							query = {
								...query,
								filters: next
							};
						}}
						onApply={() => {
							filtersOpen = false;

							commitQuery({
								...query,
								page: 1
							});
						}}
						onClear={() => {
							filtersOpen = false;
							clearSavedFilterSelection();

							commitQuery({
								...query,
								page: 1,
								filters: defaultFilters()
							});
						}}
						presets={alerts.savedFilters.items}
						onSaveAsFilter={saveAsFilter}
						saving={savingFilter}
						{alertResolutions}
						{alertStatuses}
						{caseClassifications}
						{severities}
						{customers}
						{owners}
					/>
				{/if}

				<AlertFilterLabels
					value={query.filters}
					onRemove={(key) => void removeFilter(key)}
					{alertResolutions}
					{alertStatuses}
					{caseClassifications}
					{severities}
					{customers}
					{owners}
				/>

				{#if query.view === 'list' && getSelectedCount() > 0}
					<div class="flex flex-wrap gap-2">{@render bulkActions()}</div>
				{/if}
			</div>

			{#if query.view === 'board'}
				<!--
				  The board brings its own column scrolling, so it opts
				  out of the fade-shrouded vertical scroller below and
				  just fills the remaining height.
				-->
				<div class="flex min-h-0 min-w-0 flex-1 flex-col pb-4">
					<AlertsBoard
						filters={query.filters}
						group={query.board_group}
						{severities}
						{alertStatuses}
						refreshKey={boardRefreshKey}
						onCountChange={(count) => (boardTotal = count)}
					/>
				</div>
			{:else}
				<!--
			  Scrollable alert list wrapped in a fade-shroud. The outer
			  `relative` div carries two `pointer-events-none`
			  pseudo-fades top and bottom so cards melt into the page
			  background instead of getting hard-clipped by the
			  viewport edge. The inner `<ul>` is the actual scroll
			  container — its own padding gives the fade some real
			  card content to fade over (without the padding the first
			  / last card sits flush against the fade and looks half-
			  obscured at rest).
			-->
				<div class="relative -mx-6 flex min-h-0 min-w-0 flex-1 flex-col">
					<ScrollArea class="min-h-0 min-w-0 flex-1">
						<ul class="flex min-w-0 flex-col gap-4 pb-6 pl-16 pr-16 pt-4">
							{#each alertsData.data as alert (alert.alert_id)}
								<li class="flex min-w-0 items-center gap-4">
									{#if selecting}
										<Checkbox
											checked={selected[alert.alert_id] ?? selectedAll}
											onCheckedChange={(v) => (selected = { ...selected, [alert.alert_id]: v })}
										/>
									{/if}

									<AlertCard
										{alert}
										{alertStatuses}
										expanded={expanded[alert.alert_id] ?? query.expanded}
										onExpandedChange={(v) => (expanded = { ...expanded, [alert.alert_id]: v })}
										onAssign={() => assign(alert)}
										onAssignToCurrentUser={() => assignToCurrentUser(alert)}
										onSetStatus={(status) => {
											selected = { ...selected, [alert.alert_id]: true };

											setStatus(status);
										}}
										onShowEdit={() => {
											selected = { ...selected, [alert.alert_id]: true };
											showAlertEdit = true;
										}}
										onShowHistory={() => {
											selected = { ...selected, [alert.alert_id]: true };
											showAlertHistory = true;
										}}
										onShowComments={() => {
											// Don't flag the alert as "bulk-selected" here — the
											// side panel is single-alert UX and doesn't occlude the
											// page, so toggling `selected` would surface the bulk
											// action bar (Merge / Assign / …) underneath the panel.
											commentsPanel.open({
												type: 'alerts',
												id: alert.alert_id,
												label: alert.alert_title ?? `Alert #${alert.alert_id}`
											});
										}}
										onShowInvestigationFlow={() =>
											investigationFlowPanel.open({
												id: alert.alert_id,
												label: alert.alert_title ?? `Alert #${alert.alert_id}`
											})}
										onShowMerge={() => {
											selected = { ...selected, [alert.alert_id]: true };
											// `mergeMode` is sticky, so every entry point sets it.
											// This button has always opened on a new case.
											mergeMode = 'new';
											showMerge = true;
										}}
										onShowClose={(withNote: boolean) => {
											selected = { ...selected, [alert.alert_id]: true };

											if (withNote) {
												showClose = true;
											} else {
												closeWithNote({});
											}
										}}
										onUnlinkCase={(case_id: number) => {
											selected = { ...selected, [alert.alert_id]: true };
											unlinkCase(case_id);
										}}
										onDelete={() => {
											selected = { ...selected, [alert.alert_id]: true };
											showConfirmDelete = true;
										}}
									/>
								</li>
							{/each}
						</ul>
					</ScrollArea>

					<!--
				  Frosted fade-out strips so cards melt into the page
				  background at the top/bottom of the scroll viewport
				  instead of getting hard-clipped at the edge.
				  `pointer-events-none` keeps them click-through;
				  subtle `backdrop-blur` softens card text passing
				  under the fade.
				-->
					<div
						class="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-gradient-to-b from-background via-background/85 to-transparent backdrop-blur-[1px]"
					></div>
					<div
						class="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t from-background via-background/85 to-transparent backdrop-blur-[1px]"
					></div>
				</div>
			{/if}
		</div>
	{/if}
</div>

{#if selectedAlert}
	<AlertsMergeDialog
		bind:open={showMerge}
		defaultMode={mergeMode}
		selectedAlertIds={getSelectedAlertIds()}
		selectedAlert={getSelectedAlertIds().length === 1 ? selectedAlert : undefined}
		onConfirm={confirmMergeAlerts}
		onClose={cancelSelect}
	/>

	<AlertHistoryDialog bind:open={showAlertHistory} onClose={cancelSelect} alert={selectedAlert} />

	<AlertEditDialog
		bind:open={showAlertEdit}
		onClose={cancelSelect}
		onSave={async (changes) => {
			await updateAlert(selectedAlertId, changes);
			showAlertEdit = false;
			cancelSelect();
		}}
		alert={selectedAlert}
	/>
{/if}

<!--
	Outside the `selectedAlert` block on purpose: creating an alert is
	the one alert action that does not need one to already exist.
-->
<AlertCreateDialog
	bind:open={showAlertCreate}
	onClose={() => (showAlertCreate = false)}
	onCreate={createAlert}
	saving={creatingAlert}
	{alertStatuses}
	{caseClassifications}
	{severities}
	{customers}
/>

<AlertsReasignDialog
	bind:open={reassignOpen}
	alert={reassignAlert}
	ownerId={reassignOwnerId}
	onOwnerIdChange={(ownerId) => (reassignOwnerId = ownerId)}
	onConfirm={confirmReassign}
/>

<AlertsCloseDialog
	bind:open={showClose}
	selectedAlertIds={getSelectedAlertIds()}
	onConfirm={closeWithNote}
/>

<ConfirmationDialog
	bind:open={showConfirmDelete}
	title="Are you sure?"
	message="You are about to delete this forever. This cannot be reverted. All associated data will be deleted."
	onConfirm={deleteSelected}
	onCancel={() => (showConfirmDelete = false)}
/>

<ConfirmationDialog
	bind:open={showConfirmDeletePreset}
	title="Delete preset filter?"
	message={`Are you sure you want to delete "${selectedSavedFilter?.filter_name ?? ''}"? This cannot be undone.`}
	onConfirm={deleteSelectedSavedFilter}
	onCancel={() => (showConfirmDeletePreset = false)}
/>

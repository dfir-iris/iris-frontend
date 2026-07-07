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
	import type { UpdateAlertBody } from '$lib/services/alerts.service';
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
	import AlertFilterLabels from './components/AlertFilters/AlertFilterLabels.svelte';
	import { current_user } from '$lib/stores/auth.store';
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
	import AlertHistoryDialog from './components/alert-history-dialog.svelte';
	import AlertsPagination from './components/alerts-pagination.svelte';
	import AlertsReasignDialog from './components/alerts-reasign-dialog.svelte';
	import AlertsCloseDialog from './components/alerts-close-dialog.svelte';
	import AlertEditDialog from './components/alert-edit-dialog.svelte';
	import AlertsMergeDialog, {
		type MergeAlertPayload
	} from './components/alerts-merge-dialog.svelte';
	import { mergeAlerts } from './helpers/alerts-merge';
	import { closeAlerts } from './helpers/alerts-close';
	import { assignAlertsToOwner, reassignAlertOwner } from './helpers/alerts-assign';
	import { unlinkAlertCase } from './helpers/alert-unlink';

	type QueryState = {
		page: number;
		per_page: number;
		expanded: boolean;
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
		'incident_id',
		'alert_owner_id',
		'resolution_status_id',
		'sort'
	];

	let query = $state<QueryState>({
		page: 1,
		per_page: DEFAULT_ITEMS_PER_PAGE,
		expanded: false,
		filters: defaultFilters()
	});

	const alerts = getContext<AlertsContext>(ALERTS_CTX);
	const cases = getContext<CasesContext>(CASES_CTX);
	const commentsPanel = getContext<CommentsPanelContext>(COMMENTS_PANEL_CTX);
	const investigationFlowPanel = getContext<InvestigationFlowPanelContext>(
		INVESTIGATION_FLOW_PANEL_CTX
	);

	let status = $state<'initial' | 'loading' | 'ready'>('initial');
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

	let alertResolutions = $state<AlertResolution[]>([]);
	let alertStatuses = $state<AlertStatus[]>([]);
	let caseClassifications = $state<CaseClassification[]>([]);
	let severities = $state<Severity[]>([]);

	let reassignOpen = $state(false);
	let reassignAlert = $state<Alert | null>(null);
	let reassignOwnerId = $state<string>('');

	let showConfirmDelete = $state(false);
	let showConfirmDeletePreset = $state(false);

	let showAlertHistory = $state(false);
	let showAlertEdit = $state(false);
	let showMerge = $state(false);
	let showClose = $state(false);

	const perPageOptions = [5, 10, 25, 50, 100, 200, 500].map((n) => ({
		value: String(n),
		label: `${n} entries`
	}));

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
				key === 'incident_id' ||
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

		return {
			page: Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1,
			per_page:
				Number.isFinite(perPageRaw) && perPageRaw >= 1 ? perPageRaw : DEFAULT_ITEMS_PER_PAGE,
			expanded: url.searchParams.get('expanded') === '1',
			filters
		};
	};

	const writeQueryToUrl = async (queryState: QueryState) => {
		const url = new URL(window.location.href);

		if (queryState.page <= 1) url.searchParams.delete('page');
		else url.searchParams.set('page', String(queryState.page));

		if (queryState.per_page === DEFAULT_ITEMS_PER_PAGE) url.searchParams.delete('per_page');
		else url.searchParams.set('per_page', String(queryState.per_page));

		if (queryState.expanded) url.searchParams.set('expanded', '1');
		else url.searchParams.delete('expanded');

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
		if (nextHref === currentHref) return;

		await goto(nextHref, {
			replaceState: true,
			keepFocus: true,
			noScroll: true
		});
	};

	const loadAlerts = async (next: QueryState) => {
		status = 'loading';

		const response = await alerts.listPaginated({
			...next.filters,
			alert_start_date: toApiDate(next.filters.alert_start_date),
			alert_end_date: toApiDate(next.filters.alert_end_date, true),
			creation_start_date: toApiDate(next.filters.creation_start_date),
			creation_end_date: toApiDate(next.filters.creation_end_date, true),
			page: next.page,
			per_page: next.per_page
		});

		const raw = response.data as Paginated<Alert>;
		const list = Array.isArray(raw.data) ? raw.data : [];

		alertsData = {
			...raw,
			data: list.map(normalizeAlert)
		};

		status = 'ready';
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

	const changePage = (page: number) => {
		if (status === 'loading') return;

		void commitQuery({
			...query,
			page
		});
	};

	const toggleSort = async () => {
		const nextSort: Filters['sort'] = query.filters.sort === 'asc' ? 'desc' : 'asc';

		await commitQuery({
			...query,
			page: 1,
			filters: { ...query.filters, sort: nextSort }
		});
	};

	const applyUpdatedAlert = (updated: Alert) => {
		const alertsList = Array.isArray(alertsData.data) ? alertsData.data : [];

		alertsData = {
			...alertsData,
			data: alertsList.map((alert) => (alert.alert_id === updated.alert_id ? updated : alert))
		};

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
			: (alerts.savedFilters.items.find(
					(f) => String(f.filter_id) === selectedSavedFilterId
				) ?? null)
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

	const hasActiveFilters = (filters: Filters): boolean => {
		for (const key of FILTER_KEYS) {
			if (key === 'sort') continue;

			const value = filters[key];

			if (value == null) continue;
			if (typeof value === 'number') {
				if (Number.isFinite(value)) return true;
				continue;
			}

			if (String(value).trim() !== '') return true;
		}

		return false;
	};

	$effect(() => {
		const nextQuery = readQueryFromUrl(new URL(page.url));
		query = nextQuery;

		void loadAlerts(nextQuery);
	});

	onMount(async () => {
		const alertResolutionResponse = (await AlertResolutionService.list())
			.data as unknown as RequestResponse<AlertResolution[]>;

		alertResolutions = alertResolutionResponse.data as AlertResolution[];

		const alertStatusResponse = (await AlertStatusService.list())
			.data as unknown as RequestResponse<AlertStatus[]>;

		alertStatuses = alertStatusResponse.data as AlertStatus[];

		const caseClassificationsResponse = (await CaseClassificationsService.list())
			.data as unknown as RequestResponse<CaseClassification[]>;

		caseClassifications = caseClassificationsResponse.data as CaseClassification[];

		const severitiesResponse = (await SeveritiesService.list()).data as unknown as RequestResponse<
			Severity[]
		>;

		severities = severitiesResponse.data as Severity[];

		await alerts.loadSavedFilters();
	});
</script>

<svelte:head>
	<title>Alerts</title>
</svelte:head>

<!--
  Page layout: the outer container is height-bounded so the alert list
  can scroll on its own (`min-h-0 overflow-hidden`). The header /
  filter strip / bulk-action bar / pagination all live in a
  `shrink-0` section above the scrollable `<ul>` — the header stays
  put while the user scrolls through alerts. The comments side panel
  (mounted in the alerts +layout.svelte) sits as a sibling outside of
  this scrolling region and stays full-height alongside.
-->
<div class="mx-auto flex h-full min-h-0 w-full max-w-9xl grow flex-col overflow-hidden p-6 pb-0">
	{#if status === 'initial'}
		<div class="flex h-full w-full items-center justify-center">
			<Loading size={32} />
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
					<h2 class="text-lg font-semibold whitespace-nowrap">
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
								class="w-48 [&_button[role=combobox]]:!h-7 [&_button[role=combobox]]:!px-2.5 [&_button[role=combobox]]:!py-0 [&_button[role=combobox]]:!text-xs [&_button[role=combobox]]:!rounded-md [&_button[role=combobox]]:!font-normal"
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
						<Button variant="outline" size="xs" onclick={() => (selecting = true)}>Select</Button>
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

					<Button
						variant="outline"
						size="xs"
						onclick={refreshAlerts}
						disabled={status === 'loading'}
					>
						Refresh
					</Button>

					<Button variant="outline" size="xs" onclick={toggleSort} disabled={status === 'loading'}>
						{#if query.filters.sort === 'asc'}
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
						<SelectTrigger class="h-7 px-2.5 py-0">{query.per_page} entries per page</SelectTrigger>

						<SelectContent>
							{#each perPageOptions as perPageOption}
								<SelectItem value={perPageOption.value}>{perPageOption.label}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				</div>
			</div>

			{#if getPagesCount() > 1}
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
					onApply={() =>
						commitQuery({
							...query,
							page: 1
						})}
					onClear={() => {
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
				/>
			{/if}

			<AlertFilterLabels
				value={query.filters}
				onRemove={(key) => void removeFilter(key)}
				{alertResolutions}
				{alertStatuses}
				{caseClassifications}
				{severities}
			/>

			{#if getSelectedCount() > 0}
				<div class="flex gap-2">
					<Button variant="outline" size="xs" onclick={() => (showMerge = true)}>Merge</Button>

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

					<Button variant="destructive" size="xs" onclick={() => (showClose = true)}
						>Close with note</Button
					>

					<Button variant="destructive" size="xs" onclick={() => (showConfirmDelete = true)}
						><TrashIcon /> Delete</Button
					>
				</div>
			{/if}
			</div>

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
				<ul
					class="flex min-w-0 flex-col gap-4 pl-16 pr-16 pt-4 pb-6"
				>
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

		</div>
	{/if}
</div>

{#if selectedAlert}
	<AlertsMergeDialog
		bind:open={showMerge}
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

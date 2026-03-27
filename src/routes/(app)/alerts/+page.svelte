<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import {
		ArrowDownNarrowWide,
		ArrowUpNarrowWide,
		ChevronDownIcon,
		TrashIcon
	} from 'lucide-svelte';
	import { getTotal, isFiniteNumberString, toApiDate } from '$lib/utils';
	import type { Alert } from '$lib/types/resources/alert';
	import { DEFAULT_ITEMS_PER_PAGE } from '$lib/config/api.config';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';
	import type { RequestResponse, Paginated } from '$lib/services/api.service';
	import type { UpdateAlertBody } from '$lib/services/alerts.service';
	import type { AlertStatus } from '$lib/services/alert-status.service';
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
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
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
	import AlertCommentsDialog from './components/alert-comments-dialog.svelte';
	import AlertsMergeDialog, {
		type MergeAlertPayload
	} from './components/alerts-merge-dialog.svelte';
	import { loadAlertStatuses } from './helpers/alert-status';
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
		'case_id',
		'alert_owner_id',
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

	let alertStatuses = $state<AlertStatus[]>([]);

	let reassignOpen = $state(false);
	let reassignAlert = $state<Alert | null>(null);
	let reassignOwnerId = $state<string>('');

	let showConfirmDelete = $state(false);

	let showAlertHistory = $state(false);
	let showAlertEdit = $state(false);
	let showAlertComments = $state(false);
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
				key === 'alert_owner_id'
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

	const writeQueryToUrl = (queryState: QueryState) => {
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

		window.history.replaceState(window.history.state, '', nextHref);
	};

	const loadAlerts = async (next: QueryState) => {
		status = 'loading';

		const response = await alerts.listPaginated({
			...next.filters,
			alert_start_date: toApiDate(next.filters.alert_start_date),
			alert_end_date: toApiDate(next.filters.alert_end_date, true),
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

	onMount(async () => {
		const nextQuery = readQueryFromUrl(new URL(window.location.href));
		query = nextQuery;

		await loadAlerts(nextQuery);

		alerts.loadSavedFilters({ filter_type: 'alerts', include_public: 1 });

		alertStatuses = await loadAlertStatuses();
	});
</script>

<svelte:head>
	<title>Alerts | DFIR-IRIS</title>
</svelte:head>

<div class="flex grow flex-col gap-4 p-4">
	{#if status === 'initial'}
		<div class="flex h-full w-full items-center justify-center">
			<Loading size={32} />
		</div>
	{:else}
		<div class:opacity-60={status === 'loading'} class="flex grow flex-col gap-4">
			<h1>{getTotal({ data: alertsData } as RequestResponse<Paginated<Alert>>)} Alerts</h1>

			<div class="flex items-center justify-between">
				<div class="flex gap-4">
					<Button
						variant={filtersOpen ? 'default' : 'outline'}
						onclick={() => (filtersOpen = !filtersOpen)}
					>
						Filter
					</Button>

					{#if alerts.savedFilters.items.length}
						<Select
							value={selectedSavedFilterId}
							onValueChange={(v) => {
								if (v === '') {
									clearSavedFilterSelection();
									return;
								}

								selectedSavedFilterId = v;

								const id = Number(v);
								if (!Number.isFinite(id)) return;

								applySavedFilter(id);
								filtersOpen = true;
							}}
							type="single"
						>
							<SelectTrigger>Select preset filter</SelectTrigger>

							<SelectContent>
								<SelectItem value="">Select preset filter</SelectItem>

								{#each alerts.savedFilters.items as filter (filter.filter_id)}
									<SelectItem value={String(filter.filter_id)}>{filter.filter_name}</SelectItem>
								{/each}
							</SelectContent>
						</Select>
					{/if}
				</div>

				<div class="flex gap-4">
					{#if selecting}
						<Button variant="outline" onclick={cancelSelect}>Cancel</Button>

						<Button
							variant="outline"
							onclick={() => {
								selected = {};
								selectedAll = true;
							}}>Select All</Button
						>
					{:else}
						<Button variant="outline" onclick={() => (selecting = true)}>Select</Button>
					{/if}

					<Button
						variant="outline"
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

					<Button variant="outline" onclick={refreshAlerts} disabled={status === 'loading'}>
						Refresh
					</Button>

					<Button variant="outline" onclick={toggleSort} disabled={status === 'loading'}>
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
						<SelectTrigger>{query.per_page} entries per page</SelectTrigger>

						<SelectContent>
							{#each perPageOptions as perPageOption}
								<SelectItem value={perPageOption.value}>{perPageOption.label}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				</div>
			</div>

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
				/>
			{/if}

			{#if getSelectedCount() > 0}
				<div class="flex gap-4">
					<Button variant="outline" onclick={() => (showMerge = true)}>Merge</Button>

					<DropdownMenu>
						<DropdownMenuTrigger>
							<Button variant="outline">
								Assign
								<ChevronDownIcon />
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
							<Button variant="outline">
								Set status
								<ChevronDownIcon />
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

					<Button variant="destructive" onclick={() => (showClose = true)}>Close with note</Button>

					<Button variant="destructive" onclick={() => (showConfirmDelete = true)}
						><TrashIcon /> Delete</Button
					>
				</div>
			{/if}

			{#if getPagesCount() > 1}
				<div class="flex">
					<AlertsPagination page={query.page} pages={getPagesCount()} onPageChange={changePage} />
				</div>
			{/if}

			<ul class="flex flex-col gap-4">
				{#each alertsData.data as alert (alert.alert_id)}
					<li class="flex items-center gap-4">
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
								selected = { ...selected, [alert.alert_id]: true };
								showAlertComments = true;
							}}
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

			{#if getPagesCount() > 1}
				<div class="flex pb-4">
					<AlertsPagination page={query.page} pages={getPagesCount()} onPageChange={changePage} />
				</div>
			{/if}
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

	<AlertCommentsDialog
		bind:open={showAlertComments}
		onClose={() => {
			refreshAlerts();
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

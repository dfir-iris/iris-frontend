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
	import type { RequestResponse, Paginated } from '$lib/services/api.service';
	import type { UpdateAlertBody } from '$lib/services/alerts.service';
	import { AlertStatusService, type AlertStatus } from '$lib/services/alert-status.service';
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

	const alerts = getContext<AlertsContext>(ALERTS_CTX);

	let currentPage = $state(1);
	let perPage = $state(DEFAULT_ITEMS_PER_PAGE);
	let filtersOpen = $state(false);
	let filters = $state<Filters>(defaultFilters());
	let selectedSavedFilterId = $state<string>('');
	let savingFilter = $state(false);

	let lastFiltersKey = '';

	let expandedAll = $state(false);
	let expanded = $state<Record<number, boolean>>({});

	let selecting = $state(false);
	let selectedAll = $state(false);
	let selected = $state<Record<number, boolean>>({});

	let alertsPaginated = $state<Promise<RequestResponse<Paginated<Alert>>> | null>(null);
	let alertStatuses = $state<AlertStatus[]>([]);

	let reassignOpen = $state(false);
	let reassignAlert = $state<Alert | null>(null);
	let reassignOwnerId = $state<string>('');

	let showConfirmDelete = $state(false);

	let showAlertHistory = $state(false);
	let showAlertEdit = $state(false);

	let closeOpen = $state(false);

	const perPageOptions = [5, 10, 25, 50, 100, 200, 500].map((n) => ({
		value: String(n),
		label: `${n} entries`
	}));

	const FILTER_KEYS = [
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
	] as const;

	type FilterKey = (typeof FILTER_KEYS)[number];

	const toggleSort = () => {
		const nextSort: Filters['sort'] = filters.sort === 'asc' ? 'desc' : 'asc';

		filters = { ...filters, sort: nextSort };
		currentPage = 1;

		updateUrl({
			page: 1,
			filters: { ...filters, sort: nextSort }
		});
	};

	const updateUrl = (params: {
		page?: number;
		per_page?: number;
		expanded?: boolean;
		filters?: Filters;
	}) => {
		const url = new URL(page.url);

		if (params.page !== undefined) {
			if (params.page <= 1) url.searchParams.delete('page');
			else url.searchParams.set('page', String(params.page));
		}

		if (params.per_page !== undefined) {
			if (params.per_page === DEFAULT_ITEMS_PER_PAGE) url.searchParams.delete('per_page');
			else url.searchParams.set('per_page', String(params.per_page));
		}

		if (params.expanded !== undefined) {
			if (params.expanded) url.searchParams.set('expanded', '1');
			else url.searchParams.delete('expanded');
		}

		if (params.filters !== undefined) {
			const f = params.filters;

			for (const key of FILTER_KEYS) {
				const raw = f[key];

				if (raw == null) {
					url.searchParams.delete(key);
					continue;
				}

				if (typeof raw === 'number') {
					if (!Number.isFinite(raw)) url.searchParams.delete(key);
					else url.searchParams.set(key, String(raw));
					continue;
				}

				const s = String(raw).trim();
				if (s === '') url.searchParams.delete(key);
				else url.searchParams.set(key, s);
			}
		}

		const nextHref = `${url.pathname}${url.search}`;
		const curHref = `${page.url.pathname}${page.url.search}`;
		if (nextHref === curHref) return;

		goto(nextHref, { replaceState: true, keepFocus: true, noScroll: true });
	};

	const normalizeAlert = (value: unknown): Alert => {
		if (!value || typeof value !== 'object') return {} as Alert;

		return value as Alert;
	};

	const updateAlertInPage = (id: number, patch: Partial<Alert>) => {
		if (!alertsPaginated) return;

		alertsPaginated = alertsPaginated.then((res) => {
			const pageData = res.data;
			if (!pageData || typeof pageData === 'string') return res;

			const list = Array.isArray(pageData.data) ? pageData.data : [];
			const next = list.map((alert) =>
				alert.alert_id === id ? ({ ...alert, ...patch } as Alert) : alert
			);

			return {
				...res,
				data: {
					...pageData,
					data: next
				}
			};
		});
	};

	const getPagesCount = (res: RequestResponse<Paginated<Alert>>): number => {
		const total = getTotal(res);
		if (total <= 0) return 1;
		return Math.ceil(total / perPage);
	};

	const getSelectedAlertIds = (): number[] => {
		let ids: number[] = [];

		if (selectedAll) {
			ids = alerts.list.ids;
		} else {
			for (const alertId in selected) {
				if (selected[alertId]) {
					ids.push(Number(alertId));
				}
			}
		}

		return ids;
	};

	const getSelectedCount = (): number => getSelectedAlertIds().length;

	const applySavedFilter = async (id: number) => {
		const saved = await alerts.getSavedFilter(id);
		if (!saved) return;

		selectedSavedFilterId = String(id);

		const next = savedFilterToUiFilters(saved, defaultFilters());

		filters = next;
		currentPage = 1;
		updateUrl({ page: 1, filters: next });
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

	const cancelSelect = () => {
		selecting = false;
		selectedAll = false;
		selected = {};
	};

	const refreshConditionally = (updates: (Alert | null)[]) => {
		if (updates) {
			for (const updated of updates) {
				if (updated) {
					updateAlertInPage(updated.alert_id, updated);
				}
			}

			reassignOpen = false;
			reassignAlert = null;
			reassignOwnerId = '';

			cancelSelect();
		} else {
			alerts.refresh();
		}
	};

	const updateAlert = async (alert_id: number, changes: UpdateAlertBody): Promise<Alert | null> => {
		const updated = await alerts.patch(alert_id, changes);

		if (updated) {
			updateAlertInPage(alert_id, { alert_owner_id: Number(reassignOwnerId) });
		}

		return updated;
	};

	const confirmReassign = async () => {
		let reassignAlertIds: number[] = [];

		if (reassignAlert) {
			reassignAlertIds = [reassignAlert.alert_id];
		}

		const updates = await Promise.all(
			reassignAlertIds.map((alert_id) =>
				updateAlert(alert_id, { alert_owner_id: Number(reassignOwnerId) })
			)
		);

		refreshConditionally(updates);
	};

	const assignToCurrentUser = async (alert: Alert) => {
		const nextOwnerId = $current_user?.id;

		const updated = await updateAlert(alert.alert_id, { alert_owner_id: nextOwnerId });
		if (!updated) {
			alerts.refresh();
		}
	};

	const assign = async (alert: Alert) => {
		if (!$current_user) return;

		if (alert.alert_owner_id) {
			openReassignDialog(alert);
			return;
		}

		assignToCurrentUser(alert);
	};

	const setStatus = async (alert_status_id: number) => {
		const updates = await Promise.all(
			getSelectedAlertIds().map((alert_id) => updateAlert(alert_id, { alert_status_id }))
		);

		refreshConditionally(updates);
	};

	const removeAlertFromPage = (id: number) => {
		if (!alertsPaginated) return;

		alertsPaginated = alertsPaginated.then((res) => {
			const pageData = res.data;
			if (!pageData || typeof pageData === 'string') return res;

			const list = Array.isArray(pageData.data) ? pageData.data : [];
			const next = list.filter((alert) => alert.alert_id !== id);

			return {
				...res,
				data: {
					...pageData,
					data: next,
					total: Math.max(0, (pageData.total ?? 0) - 1)
				}
			};
		});
	};

	const closeWithNote = async (changes: UpdateAlertBody) => {
		const closedStatusId = alertStatuses.find(
			(alertStatus) => alertStatus.status_name.toLowerCase() === 'closed'
		)?.status_id;

		const updates = await Promise.all(
			getSelectedAlertIds().map((alert_id) =>
				updateAlert(alert_id, {
					...changes,
					alert_status_id: closedStatusId,
					alert_resolution_status_id: changes.alert_resolution_status_id,
					alert_note: changes.alert_note,
					alert_tags: changes.alert_tags
				})
			)
		);

		refreshConditionally(updates);
		closeOpen = false;
	};

	const deleteSelected = async () => {
		const alertIds = getSelectedAlertIds();

		if (!alertIds.length) {
			showConfirmDelete = false;
			return;
		}

		for (const alertId of alertIds) {
			removeAlertFromPage(alertId);
			await alerts.remove(alertId);
		}

		showConfirmDelete = false;
		cancelSelect();
	};

	$effect(() => {
		const urlPage = Number(page.url.searchParams.get('page') ?? '1');
		const urlPerPage = Number(
			page.url.searchParams.get('per_page') ?? String(DEFAULT_ITEMS_PER_PAGE)
		);

		currentPage = Number.isFinite(urlPage) && urlPage >= 1 ? urlPage : 1;
		perPage = Number.isFinite(urlPerPage) && urlPerPage >= 1 ? urlPerPage : DEFAULT_ITEMS_PER_PAGE;

		const urlExpanded = page.url.searchParams.get('expanded') === '1';
		expandedAll = urlExpanded;

		const nextFilters: Filters = { ...defaultFilters() };

		for (const key of FILTER_KEYS) {
			const raw = page.url.searchParams.get(key);
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
					(nextFilters as Record<FilterKey, unknown>)[key] = Number(raw);
				}
				continue;
			}

			(nextFilters as Record<FilterKey, unknown>)[key] = raw;
		}

		const nextFiltersKey = JSON.stringify(nextFilters);
		if (nextFiltersKey !== lastFiltersKey) {
			lastFiltersKey = nextFiltersKey;
			filters = nextFilters;
		}

		const params = {
			...nextFilters,
			alert_start_date: toApiDate(nextFilters.alert_start_date),
			alert_end_date: toApiDate(nextFilters.alert_end_date, true),
			page: currentPage,
			per_page: perPage
		};

		const p = alerts.listPaginated(params);

		alertsPaginated = p.then((res) => {
			const raw = res.data;

			if (!raw || typeof raw !== 'object' || typeof raw === 'string') {
				const empty: Paginated<Alert> = {
					data: [] as Alert[],
					total: 0,
					current_page: currentPage,
					last_page: 1,
					next_page: null
				};

				return {
					...res,
					ok: false,
					data: empty
				};
			}

			const pageData = raw as Paginated<Alert>;
			const list = Array.isArray(pageData.data) ? pageData.data : ([] as Alert[]);
			return {
				...res,
				data: {
					...pageData,
					data: list.map(normalizeAlert)
				}
			};
		});
	});

	let selectedAlertId = $derived(getSelectedAlertIds()[0]);
	let selectedAlert = $derived(alerts.byId[selectedAlertId]);

	onMount(async () => {
		alerts.loadSavedFilters({ filter_type: 'alerts', include_public: 1 });

		const alertStatusResponse = (await AlertStatusService.list())
			.data as unknown as RequestResponse<AlertStatus[]>;

		alertStatuses = alertStatusResponse.data as AlertStatus[];
	});
</script>

<svelte:head>
	<title>Alerts | DFIR-IRIS</title>
</svelte:head>

<div class="flex grow flex-col gap-4 p-4">
	{#await alertsPaginated}
		<h1>Alerts</h1>
	{:then res}
		<h1>{getTotal(res)} Alerts</h1>

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
						updateUrl({ expanded: !expandedAll });
					}}
				>
					{expandedAll ? 'Collapse All' : 'Expand All'}
				</Button>

				<Button variant="outline" onclick={() => alerts.refresh()}>Refresh</Button>

				<Button variant="outline" onclick={toggleSort}>
					{#if filters.sort === 'asc'}
						<ArrowDownNarrowWide class="h-4 w-4" />
					{:else}
						<ArrowUpNarrowWide class="h-4 w-4" />
					{/if}
				</Button>

				<Select
					value={String(perPage)}
					onValueChange={(value) => {
						const nextPerPage = Number(value);
						perPage = nextPerPage;
						currentPage = 1;
						updateUrl({ per_page: nextPerPage, page: 1 });
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

		{#if filtersOpen}
			<AlertFilters
				value={filters}
				onChange={(next) => (filters = next)}
				onApply={() => {
					currentPage = 1;
					updateUrl({ page: 1, filters });
				}}
				onClear={() => {
					filters = defaultFilters();
					currentPage = 1;
					updateUrl({ page: 1, filters });
					clearSavedFilterSelection();
				}}
				presets={alerts.savedFilters.items}
				onSaveAsFilter={saveAsFilter}
				saving={savingFilter}
			/>
		{/if}

		{#if getSelectedCount() > 0}
			<div class="flex gap-4">
				{#if getSelectedCount() > 1}
					<Button variant="outline" onclick={() => {}}>Merge</Button>
				{/if}

				<DropdownMenu>
					<DropdownMenuTrigger>
						<Button variant="outline">
							Assign

							<ChevronDownIcon />
						</Button>
					</DropdownMenuTrigger>

					<DropdownMenuContent align="end">
						<DropdownMenuItem
							onclick={() => {
								for (const alertId of getSelectedAlertIds()) {
									assignToCurrentUser(alerts.byId[alertId]);
								}

								cancelSelect();
							}}>Assign to me</DropdownMenuItem
						>

						<DropdownMenuItem
							onclick={() =>
								openReassignDialog(
									getSelectedAlertIds().length === 1
										? alerts.byId[getSelectedAlertIds()[0]]
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

				<Button variant="destructive" onclick={() => (closeOpen = true)}>Close with note</Button>

				<Button variant="destructive" onclick={() => (showConfirmDelete = true)}
					><TrashIcon /> Delete</Button
				>
			</div>
		{/if}

		<div class="flex">
			<AlertsPagination
				page={currentPage}
				pages={getPagesCount(res as RequestResponse<Paginated<Alert>>)}
				onPageChange={(page) => {
					currentPage = page;
					updateUrl({ page });
				}}
			/>
		</div>

		<ul class="flex flex-col gap-4">
			{#each (res?.data as Paginated<Alert>).data as alert}
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
						expanded={expanded[alert.alert_id] ?? expandedAll}
						onExpandedChange={(v) => (expanded = { ...expanded, [alert.alert_id]: v })}
						onAssign={() => assign(alert)}
						onAssignToCurrentUser={() => assignToCurrentUser(alert)}
						onSetStatus={(s) => {
							selected[alert.alert_id] = true;
							setStatus(s);
						}}
						onShowEdit={() => {
							selected[alert.alert_id] = true;
							showAlertEdit = true;
						}}
						onShowHistory={() => {
							selected[alert.alert_id] = true;
							showAlertHistory = true;
						}}
						onDelete={() => {
							selected[alert.alert_id] = true;
							showConfirmDelete = true;
						}}
					/>
				</li>
			{/each}
		</ul>

		<div class="flex pb-4">
			<AlertsPagination
				page={currentPage}
				pages={getPagesCount(res as RequestResponse<Paginated<Alert>>)}
				onPageChange={(page) => {
					currentPage = page;
					updateUrl({ page });
				}}
			/>
		</div>
	{/await}
</div>

{#if selectedAlert}
	<AlertHistoryDialog bind:open={showAlertHistory} onClose={cancelSelect} alert={selectedAlert} />

	<AlertEditDialog
		bind:open={showAlertEdit}
		onClose={cancelSelect}
		onSave={async (changes) => {
			refreshConditionally([await updateAlert(selectedAlertId, changes)]);

			cancelSelect();

			showAlertEdit = false;
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
	bind:open={closeOpen}
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

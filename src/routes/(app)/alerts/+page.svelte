<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { ArrowDownNarrowWide, ArrowUpNarrowWide } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getTotal } from '$lib/utils';
	import { DEFAULT_ITEMS_PER_PAGE } from '$lib/config/api.config';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import type { RequestResponse, Paginated } from '$lib/services/api.service';
	import type { Alert } from '$lib/types/resources/alert';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Select } from '$lib/components/ui/select';
	import SelectContent from '$lib/components/ui/select/select-content.svelte';
	import SelectItem from '$lib/components/ui/select/select-item.svelte';
	import SelectTrigger from '$lib/components/ui/select/select-trigger.svelte';
	import {
		AlertFilters,
		defaultFilters,
		savedFilterToUiFilters,
		uiFiltersToSavedFilterData,
		type Filters
	} from './components/AlertFilters';
	import { AlertCard } from './components/AlertCard';
	import AlertsPagination from './components/alerts-pagination.svelte';

	const alerts = getContext<AlertsContext>(ALERTS_CTX);

	let currentPage = $state(1);
	let perPage = $state(DEFAULT_ITEMS_PER_PAGE);
	let filtersOpen = $state(false);
	let filters = $state<Filters>(defaultFilters());
	let selectedSavedFilterId = $state<string>('');
	let savingFilter = $state(false);

	let expandedAll = $state(false);
	let expanded = $state<Record<number, boolean>>({});

	let lastFiltersKey = '';

	let alertsPaginated = $state<Promise<RequestResponse<Paginated<Alert>>> | null>(null);

	const perPageOptions = [5, 10, 25, 50, 100].map((n) => ({
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

	const isFiniteNumberString = (v: string) => {
		const n = Number(v);
		return Number.isFinite(n) && v.trim() !== '';
	};

	const toApiStartDate = (v: string | undefined) => {
		if (!v) return undefined;
		if (v.includes('T')) return v;
		return `${v}T00:00:00`;
	};

	const toApiEndDate = (v: string | undefined) => {
		if (!v) return undefined;
		if (v.includes('T')) return v;
		return `${v}T23:59:59`;
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

		void goto(nextHref, { replaceState: true, keepFocus: true, noScroll: true });
	};

	const normalizeAlert = (value: unknown): Alert => {
		if (!value || typeof value !== 'object') return {} as Alert;

		return value as Alert;
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
			alert_start_date: toApiStartDate(nextFilters.alert_start_date),
			alert_end_date: toApiEndDate(nextFilters.alert_end_date),
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

	const getPagesCount = (res: RequestResponse<Paginated<Alert>>): number => {
		const total = getTotal(res);
		if (total <= 0) return 1;
		return Math.ceil(total / perPage);
	};

	const applySavedFilter = async (id: number) => {
		const saved = await alerts.getSavedFilter(id);
		if (!saved) return;

		selectedSavedFilterId = String(id);

		const next = savedFilterToUiFilters(saved, defaultFilters());

		filters = next;
		currentPage = 1;
		updateUrl({ page: 1, filters: next });
	};

	const clearSavedFilterSelection = () => {
		selectedSavedFilterId = '';
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

	onMount(() => {
		void alerts.loadSavedFilters({ filter_type: 'alerts', include_public: 1 });
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

							void applySavedFilter(id);

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
				<Button variant="outline" onclick={() => alerts.refresh()}>Refresh</Button>

				<Button variant="outline" onclick={toggleSort}>
					{#if filters.sort === 'asc'}
						<ArrowDownNarrowWide class="h-4 w-4" />
					{:else}
						<ArrowUpNarrowWide class="h-4 w-4" />
					{/if}
				</Button>

				<Button
					variant="outline"
					onclick={() => {
						expanded = {};
						updateUrl({ expanded: !expandedAll });
					}}
				>
					{expandedAll ? 'Collapse All' : 'Expand All'}
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
				<li>
					<AlertCard
						{alert}
						expanded={expanded[alert.alert_id] ?? expandedAll}
						onExpandedChange={(v) => {
							expanded = { ...expanded, [alert.alert_id]: v };
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

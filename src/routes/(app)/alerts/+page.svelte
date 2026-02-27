<script lang="ts">
	import { getContext } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { getTotal } from '$lib/utils';
	import { DEFAULT_ITEMS_PER_PAGE } from '$lib/config/api.config';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import type { RequestResponse, Paginated } from '$lib/services/api.service';
	import type { Alert } from '$lib/types/resources/alert';
	import * as Card from '$lib/components/ui/card';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Select } from '$lib/components/ui/select';
	import SelectContent from '$lib/components/ui/select/select-content.svelte';
	import SelectItem from '$lib/components/ui/select/select-item.svelte';
	import SelectTrigger from '$lib/components/ui/select/select-trigger.svelte';
	import AlertsPagination from './components/alerts-pagination.svelte';

	const alerts = getContext<AlertsContext>(ALERTS_CTX);

	let currentPage = $state(1);
	let perPage = $state(DEFAULT_ITEMS_PER_PAGE);

	let alertsPaginated = $state<Promise<RequestResponse<Paginated<Alert>>> | null>(null);

	const perPageOptions = [5, 10, 25, 50, 100].map((n) => ({
		value: String(n),
		label: `${n} entries`
	}));

	const updateUrl = (params: { page?: number; per_page?: number; expanded?: boolean }) => {
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

		const params = {
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
			<div class="flex">
				<!-- Filters... -->
			</div>

			<div class="flex gap-4">
				<Button onclick={() => alerts.refresh()}>Refresh</Button>

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

		<div class="flex">
			<AlertsPagination
				page={currentPage}
				pages={getPagesCount(res as RequestResponse<Paginated<Alert>>)}
				onPageChange={(p) => {
					currentPage = p;
					updateUrl({ page: p });
				}}
			/>
		</div>

		<ul class="flex flex-col gap-4">
			{#each (res?.data as Paginated<Alert>).data as alert}
				<li>
					<Card.Root>
						<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
							{alert.alert_title}
						</Card.Header>

						<Card.Content>
							{alert.alert_description}
						</Card.Content>
					</Card.Root>
				</li>
			{/each}
		</ul>

		<div class="flex pb-4">
			<AlertsPagination
				page={currentPage}
				pages={getPagesCount(res as RequestResponse<Paginated<Alert>>)}
				onPageChange={(p) => {
					currentPage = p;
					updateUrl({ page: p });
				}}
			/>
		</div>
	{/await}
</div>

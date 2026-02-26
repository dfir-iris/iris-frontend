<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { RefreshCw } from 'lucide-svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import type { Alert } from '$lib/types/resources/alert';
	import type { Paginated, RequestResponse } from '$lib/services/api.service';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card/index.js';
	import AlertsDataTable from '$lib/components/common/alerts-data-table.svelte';

	const alerts = getContext<AlertsContext | undefined>(ALERTS_CTX);

	let alertsPromise = $state<Promise<RequestResponse<Paginated<Alert>>> | null>(null);

	const currentPage = $derived(() => {
		const p = Number(page.url.searchParams.get('page') ?? '1');
		return Number.isFinite(p) && p >= 1 ? p : 1;
	});

	const fetchPage = (p: number) => {
		if (!alerts) return;
		alertsPromise = alerts.listPaginated({ page: p }) as Promise<RequestResponse<Paginated<Alert>>>;
	};

	onMount(() => {
		if (!alertsPromise && alerts) fetchPage(currentPage());
	});

	const updateUrl = (params: { page?: number }) => {
		const url = new URL(page.url);

		if (params.page !== undefined) {
			if (params.page <= 1) url.searchParams.delete('page');
			else url.searchParams.set('page', String(params.page));
		}

		const nextHref = `${url.pathname}${url.search}${url.hash}`;
		const curHref = `${page.url.pathname}${page.url.search}${page.url.hash}`;
		if (nextHref === curHref) return;

		void goto(nextHref, { replaceState: true, keepFocus: true, noScroll: true });
	};

	const onPageChange = (p: number) => {
		fetchPage(p);
		updateUrl({ page: p });
	};
</script>

<Card.Root class="flex flex-col p-4">
	<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
		<Card.Title class="text-lg font-medium">Attributes Alerts</Card.Title>

		{#if alerts}
			<Button
				variant="ghost"
				size="icon"
				onclick={() => {
					fetchPage(currentPage());
				}}
			>
				<RefreshCw class="h-4 w-4" />
			</Button>
		{/if}
	</Card.Header>

	<Card.Content class="p-0">
		{#if alertsPromise}
			<AlertsDataTable
				class="h-full border-0"
				alerts={alertsPromise}
				page={currentPage()}
				{onPageChange}
			/>
		{/if}
	</Card.Content>
</Card.Root>

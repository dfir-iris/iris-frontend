<script lang="ts">
	import { getContext, onMount } from 'svelte';
	import { BellRingIcon, LayersIcon, ListTodoIcon, ClipboardCheckIcon } from 'lucide-svelte';
	import { page } from '$app/state';
	import { getTotal } from '$lib/utils';
	import BaseKpi from '$lib/components/ui/card/card-base-kpi.svelte';
	import UserCurrentAlertsTable from './[components]/user-current-alerts-table.svelte';
	import CurrentUserCasesTable from './[components]/user-current-cases-table.svelte';
	import UserCurrentReviewsTable from './[components]/user-current-reviews-table.svelte';
	import UserCurrentTasksTable from './[components]/user-current-tasks-table.svelte';
	import type { Paginated, RequestResponse } from '$lib/services/api.service';
	import type { Alert } from '$lib/types/resources/alert';
	import type { Case } from '$lib/types/resources/case';
	import { ALERTS_CTX, type AlertsContext } from '$lib/contexts/alerts.context.svelte';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';

	const alerts = getContext<AlertsContext | undefined>(ALERTS_CTX);
	const cases = getContext<CasesContext | undefined>(CASES_CTX);

	let activeTab = $state('');
	let hash = $derived(() => page.url.hash);

	let alertsPromise = $state<Promise<RequestResponse<Paginated<Alert>>> | null>(null);
	let casesPromise = $state<Promise<RequestResponse<Paginated<Case>>> | null>(null);
	let tasksPromise = $state<Promise<unknown> | null>(null);
	let reviewsPromise = $state<Promise<unknown> | null>(null);

	onMount(async () => {
		if (!alertsPromise) {
			alertsPromise = alerts?.listPaginated() as unknown as Promise<
				RequestResponse<Paginated<Alert>>
			>;
		}

		if (!casesPromise) {
			casesPromise = cases?.listPaginated() as unknown as Promise<RequestResponse<Paginated<Case>>>;
		}
	});

	$effect(() => {
		activeTab = hash().replace('#', '');
	});
</script>

<svelte:head>
	<title>Dashboard | DFIR-IRIS</title>
</svelte:head>

<div class="flex flex-col space-y-6 p-6">
	<div class="flex items-center justify-between py-2">
		<h1>Dashboard</h1>
		<div class="flex items-center space-x-2"></div>
	</div>

	<div class="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
		<!-- Current cases KPI -->
		{#await casesPromise ?? Promise.resolve(undefined)}
			<BaseKpi title="Current Cases" icon={LayersIcon} value={0} isLoading></BaseKpi>
		{:then res}
			<a href="/#cases">
				<BaseKpi
					title="Current Cases"
					subtitle={activeTab !== 'cases' ? 'Click to view' : undefined}
					icon={LayersIcon}
					value={getTotal(res)}
				></BaseKpi>
			</a>
		{/await}

		<!-- Tasks KPI -->
		{#await tasksPromise ?? Promise.resolve(undefined)}
			<BaseKpi title="Pending Tasks" icon={ListTodoIcon} value={0} isLoading></BaseKpi>
		{:then res}
			<a href="/#tasks">
				<BaseKpi
					title="Pending Tasks"
					subtitle={activeTab !== 'tasks' ? 'Click to view' : undefined}
					icon={ListTodoIcon}
					value={getTotal(res)}
				></BaseKpi>
			</a>
		{/await}

		<!-- Reviews KPI -->
		{#await reviewsPromise ?? Promise.resolve(undefined)}
			<BaseKpi title="Pending Reviews" icon={ListTodoIcon} value={0} isLoading></BaseKpi>
		{:then res}
			<a href="/#reviews">
				<BaseKpi
					title="Pending Reviews"
					subtitle={activeTab !== 'reviews' ? 'Click to view' : undefined}
					icon={ClipboardCheckIcon}
					value={getTotal(res)}
				></BaseKpi>
			</a>
		{/await}

		<!-- Alerts KPI -->
		{#await alertsPromise ?? Promise.resolve(undefined)}
			<BaseKpi title="Attributes Alerts" icon={ListTodoIcon} value={0} isLoading></BaseKpi>
		{:then res}
			<a href="/#alerts">
				<BaseKpi
					title="Attributes Alerts"
					subtitle={activeTab !== 'alerts' ? 'Click to view' : undefined}
					icon={BellRingIcon}
					value={getTotal(res)}
				></BaseKpi>
			</a>
		{/await}
	</div>

	{#if activeTab === 'cases'}
		{#if casesPromise}
			<CurrentUserCasesTable />
		{/if}
	{:else if activeTab === 'tasks'}
		{#if tasksPromise}
			<UserCurrentTasksTable data={tasksPromise} />
		{/if}
	{:else if activeTab === 'reviews'}
		{#if reviewsPromise}
			<UserCurrentReviewsTable data={reviewsPromise} />
		{/if}
	{:else if activeTab === 'alerts'}
		{#if alertsPromise}
			<UserCurrentAlertsTable />
		{/if}
	{/if}
</div>

<script lang="ts">
	import BaseKpi from '$lib/components/ui/card/card-base-kpi.svelte';
	import UserCurrentTasksTable from './[components]/user-current-tasks-table.svelte';
	import { BellRingIcon, LayersIcon, ListTodoIcon, ClipboardCheckIcon } from 'lucide-svelte';
	import CurrentUserCasesTable from './[components]/user-current-cases-table.svelte';
	import UserCurrentReviewsTable from './[components]/user-current-reviews-table.svelte';
	import UserCurrentAlerts from './[components]/user-current-alerts.svelte';
	import type { PageData } from './$types';
	import { page } from '$app/stores';
	import type { Paginated } from '$lib/services/api.service';
	import type { Case } from '$lib/types/resources/case';

	let { data }: { data: PageData } = $props();

	let tasks = data.tasks || [];
	let reviews = data.reviews || [];
	let alerts = data.alerts || [];

	let activeTab = $state('');
	let hash = $derived(() => $page.url.hash);

	$effect(() => {
		activeTab = hash().replace('#', '');
	});
</script>

<div class="flex h-full flex-col space-y-4 overflow-hidden p-8 pt-6">
	<!-- Page Header -->
	<div class="flex items-center justify-between space-y-2 py-2">
		<h1 class="">Dashboard</h1>
		<div class="flex items-center space-x-2"></div>
	</div>

	<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
		<!-- Current cases KPI -->
		{#await data.cases}
			<BaseKpi title="Current Cases" icon={LayersIcon} value={0} isLoading></BaseKpi>
		{:then { data: cases }}
			<a href="/#cases">
				<BaseKpi
					title="Current Cases"
					subtitle={activeTab !== 'cases' ? 'Click to view' : undefined}
					icon={LayersIcon}
					value={cases ? (cases as Paginated<Case>).total : 0}
				></BaseKpi>
			</a>
		{/await}

		<!-- Tasks KPI -->
		{#await data.tasks}
			<BaseKpi title="Pending Tasks" icon={ListTodoIcon} value={0} isLoading></BaseKpi>
		{:then tasks}
			<a href="/#tasks">
				<BaseKpi
					title="Pending Tasks"
					subtitle={activeTab !== 'tasks' ? 'Click to view' : undefined}
					icon={ListTodoIcon}
					value={tasks?.data?.data?.total ?? 0}
				></BaseKpi>
			</a>
		{/await}

		<!-- Reviews KPI -->
		{#await data.reviews}
			<BaseKpi title="Pending Reviews" icon={ListTodoIcon} value={0} isLoading></BaseKpi>
		{:then reviews}
			<a href="/#reviews">
				<BaseKpi
					title="Pending Reviews"
					subtitle={activeTab !== 'reviews' ? 'Click to view' : undefined}
					icon={ClipboardCheckIcon}
					value={reviews?.data?.data?.total ?? 0}
				></BaseKpi>
			</a>
		{/await}

		<!-- Alerts KPI -->
		{#await data.alerts}
			<BaseKpi title="Attributes Alerts" icon={ListTodoIcon} value={0} isLoading></BaseKpi>
		{:then alerts}
			<a href="/#alerts">
				<BaseKpi
					title="Attributes Alerts"
					subtitle={activeTab !== 'alerts' ? 'Click to view' : undefined}
					icon={BellRingIcon}
					value={alerts?.data?.data?.total ?? 0}
				></BaseKpi>
			</a>
		{/await}
	</div>

	{#if activeTab === 'cases'}
		<CurrentUserCasesTable cases={data.cases} />
	{:else if activeTab === 'tasks'}
		<UserCurrentTasksTable data={data.tasks} />
	{:else if activeTab === 'reviews'}
		<UserCurrentReviewsTable {...reviews} />
	{:else if activeTab === 'alerts'}
		<UserCurrentAlerts {...alerts} />
	{/if}
</div>

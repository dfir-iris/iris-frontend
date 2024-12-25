<script lang="ts">
	import BaseKpi from '$lib/components/ui/card/card-base-kpi.svelte';
	import UserCurrentTasksTable from './[components]/user-current-tasks-table.svelte';
	import { BellRingIcon, LayersIcon, ListTodoIcon, ClipboardCheckIcon } from 'lucide-svelte';
	import CurrentUserCasesTable from './[components]/user-current-cases-table.svelte';
	import UserCurrentReviewsTable from './[components]/user-current-reviews-table.svelte';
	import UserCurrentAlerts from './[components]/user-current-alerts.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let activeTab = $state('cases');

	let tasks = data.tasks || [];
	let reviews = data.reviews || [];
	let alerts = data.alerts || [];

	function toggleView(key: string) {
		activeTab = activeTab === key ? '' : key;
	}

	// Load current tab from URL hash
	$effect.pre(() => {
		if (window.location.hash) {
			activeTab = `${window.location.hash}`;
		}
	});

	// When active tab changes, sync it to the hash
	$effect(() => {
		window.location.hash = activeTab;
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
			{@const hashName = 'cases'}
			<BaseKpi
				title="Current Cases"
				icon={LayersIcon}
				value={cases.results.length}
				isActive={activeTab === hashName}
				subtitle={activeTab === hashName ? 'Click to hide' : 'Click to view'}
				onClick={() => toggleView(hashName)}
			></BaseKpi>
		{/await}

		<!-- Tasks KPI -->
		{#await data.tasks}
			<BaseKpi title="Pending Tasks" icon={ListTodoIcon} value={0} isLoading></BaseKpi>
		{:then tasks}
			{@const hashName = 'tasks'}
			<BaseKpi
				title="Pending Tasks"
				icon={ListTodoIcon}
				value={tasks.data.length}
				isActive={activeTab === hashName}
				subtitle={activeTab === hashName ? 'Click to hide' : 'Click to view'}
				onClick={() => toggleView(hashName)}
			></BaseKpi>
		{/await}

		<!-- Reviews KPI -->
		{#await data.reviews}
			<BaseKpi title="Pending Reviews" icon={ListTodoIcon} value={0} isLoading></BaseKpi>
		{:then reviews}
			{@const hashName = 'reviews'}
			<BaseKpi
				title="Pending Reviews"
				icon={ClipboardCheckIcon}
				value={reviews.data.length}
				isActive={activeTab === hashName}
				subtitle={activeTab === hashName ? 'Click to hide' : 'Click to view'}
				onClick={() => toggleView(hashName)}
			></BaseKpi>
		{/await}

		<!-- Alerts KPI -->
		{#await data.alerts}
			<BaseKpi title="Attributes Alerts" icon={ListTodoIcon} value={0} isLoading></BaseKpi>
		{:then alerts}
			{@const hashName = 'reviews'}
			<BaseKpi
				title="Attributes Alerts"
				icon={BellRingIcon}
				value={alerts.data.length}
				isActive={activeTab === hashName}
				subtitle={activeTab === hashName ? 'Click to hide' : 'Click to view'}
				onClick={() => toggleView(hashName)}
			></BaseKpi>
		{/await}
	</div>

	{#if activeTab === 'cases'}
		<CurrentUserCasesTable cases={data.cases} />
	{:else if activeTab === 'tasks'}
		<UserCurrentTasksTable {...tasks} />
	{:else if activeTab === 'reviews'}
		<UserCurrentReviewsTable {...reviews} />
	{:else if activeTab === 'alerts'}
		<UserCurrentAlerts {...alerts} />
	{/if}
</div>

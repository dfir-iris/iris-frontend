<script lang="ts">
	import { activeViewStore } from '$lib/stores/active-view.store';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import BaseKpi from '$lib/components/ui/card/card-base-kpi.svelte';
	import UserCurrentTasksTable from './[components]/user-current-tasks-table.svelte';
	import {
		ClipboardCheck,
		Layers,
		ListTodo,
		BellRingIcon,
		LayersIcon,
		ListTodoIcon,
		ClipboardCheckIcon
	} from 'lucide-svelte';
	import CurrentUserCasesTable from './[components]/user-current-cases-table.svelte';
	import UserCurrentReviewsTable from './[components]/user-current-reviews-table.svelte';
	import UserCurrentAlerts from './[components]/user-current-alerts.svelte';
	import { current_user } from '$lib/stores/auth.store';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let cases = data.cases || [];
	let tasks = data.tasks || [];
	let reviews = data.reviews || [];
	let alerts = data.alerts || [];

	const views = {
		cases: {
			title: 'Current Cases',
			icon: Layers,
			component: CurrentUserCasesTable
		},
		tasks: {
			title: 'Pending Tasks',
			icon: ListTodo,
			component: UserCurrentTasksTable
		},
		reviews: {
			title: 'Pending Reviews',
			icon: ClipboardCheck,
			component: UserCurrentReviewsTable
		},
		alerts: {
			title: 'Attributes Alerts',
			icon: BellRingIcon,
			component: UserCurrentAlerts
		}
	};

	let activeTab = $state('overview');

	let userId: number;
	current_user.subscribe((user) => {
		if (user) {
			userId = user.id;
		}
	});

	function toggleView(key: string) {
		activeViewStore.set($activeViewStore === key ? '' : key);
	}

	function handleTabChange(value: string) {
		if (value === 'overview') {
			$activeViewStore.set('');
		}
		activeTab = value;
	}

	// Load current tab from URL hash
	$effect.pre(() => {
		if (window.location.hash) {
			$activeViewStore = `${window.location.hash}`;
		}
	});

	// When active tab changes, sync it to the hash
	$effect(() => {
		window.location.hash = $activeViewStore;
	});

	$inspect(data);
</script>

<div class="space-y-4 p-8 pt-6">
	<div class="flex items-center justify-between space-y-2">
		<h2 class="text-3xl font-bold tracking-tight">Dashboard</h2>
		<div class="flex items-center space-x-2"></div>
	</div>
	<Tabs.Root value={activeTab} class="space-y-4" on:change={(e) => handleTabChange(e.detail.value)}>
		<Tabs.List>
			<Tabs.Trigger value="overview">Overview</Tabs.Trigger>
			<Tabs.Trigger value="reports">Activities</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="overview" class="space-y-4">
			<div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
				<!-- Current cases KPI -->
				{#await data.cases}
					<BaseKpi title="Current Cases" icon={LayersIcon} value={0} isLoading></BaseKpi>
				{:then cases}
					{@const hashName = 'cases'}
					<BaseKpi
						title="Current Cases"
						icon={LayersIcon}
						value={cases.data.length}
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

			{#if $activeViewStore === 'cases'}
				<CurrentUserCasesTable {...cases} />
			{:else if $activeViewStore === 'tasks'}
				<UserCurrentTasksTable {...tasks} />
			{:else if $activeViewStore === 'reviews'}
				<UserCurrentReviewsTable {...reviews} />
			{:else if $activeViewStore === 'alerts'}
				<UserCurrentAlerts {...alerts} />
			{/if}
		</Tabs.Content>
	</Tabs.Root>
</div>

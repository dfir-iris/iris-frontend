<script lang="ts">
    import { activeViewStore } from '$lib/stores/active-view.store';
    import * as Tabs from "$lib/components/ui/tabs/index.js";
    import BaseKpi from '$lib/components/ui/card/card-base-kpi.svelte';
    import UserCurrentTasksTable from './[components]/user-current-tasks-table.svelte';
    import { ClipboardCheck, Layers, ListTodo, BellRingIcon } from "lucide-svelte";
    import { casesStore, isLoadingStore } from '$lib/stores/cases.store';
    import { tasksStore, isLoadingTasksStore } from '$lib/stores/tasks.store';
    import { reviewsStore, isLoadingReviewsStore } from '$lib/stores/reviews.store';
    import { alertsStore, isLoadingAlertsStore } from '$lib/stores/alerts.store';
    import CurrentUserCasesTable from './[components]/user-current-cases-table.svelte';
    import UserCurrentReviewsTable from './[components]/user-current-reviews-table.svelte';
    import UserCurrentAlerts from './[components]/user-current-alerts.svelte';
    import { ApiService } from '$lib/services/api.service';
    import { ENDPOINTS } from '$lib/constants/endpoints';
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
            component:  UserCurrentAlerts
        }
    };

    let activeTab = $state('overview');

    let userId: number;
    current_user.subscribe(user => {
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

    
</script>

<div class="space-y-4 p-8 pt-6">
    <div class="flex items-center justify-between space-y-2">
        <h2 class="text-3xl font-bold tracking-tight">Dashboard</h2>
        <div class="flex items-center space-x-2">

        </div>
    </div>
    <Tabs.Root value={activeTab} class="space-y-4" on:change={(e) => handleTabChange(e.detail.value)}>
        <Tabs.List>
            <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
            <Tabs.Trigger value="reports">Activities</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="overview" class="space-y-4">
            <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {#each Object.entries(views) as [key, view]}
                    <BaseKpi
                        title={view.title}
                        icon={view.icon}
                        value={key === 'cases' ? cases.length : key === 'tasks' ? tasks.length : key === 'reviews' ? reviews.length : key === 'alerts' ? alerts?.length : 0}
                        subtitle={key === $activeViewStore ? 'Click to hide' : 'Click to view'}
                        isActive={key === $activeViewStore}
                        isLoading={key === 'cases' ? $isLoadingStore : key === 'tasks' ? $isLoadingTasksStore : key === 'reviews' ? $isLoadingReviewsStore : key === 'alerts' ? $isLoadingAlertsStore : false}
                        onClick={() => toggleView(key)}
                    />
                {/each}
            </div>
        
            {#if $activeViewStore === "cases"}
                <CurrentUserCasesTable {...cases} />
            {:else if $activeViewStore === "tasks"}
                <UserCurrentTasksTable {...tasks} />
            {:else if $activeViewStore === "reviews"}
                <UserCurrentReviewsTable {...reviews} />
            {:else if $activeViewStore === "alerts"}
                <UserCurrentAlerts {...alerts} />
            {/if}
            
        </Tabs.Content>
    </Tabs.Root>
</div>
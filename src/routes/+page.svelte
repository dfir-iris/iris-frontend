<script lang="ts">
    import { onMount } from 'svelte';
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

    let activeTab = 'overview';

    let userId: number;
    current_user.subscribe(user => {
        if (user) {
            userId = user.id;
        }
    });


    async function loadInitialData() {
        isLoadingStore.set(true);
        isLoadingTasksStore.set(true);
        isLoadingReviewsStore.set(true);
        isLoadingAlertsStore.set(true);

        let api_requests = [
            ApiService.get(`${ENDPOINTS.user.cases.list}?cid=1&show_closed=false`),
            ApiService.get(ENDPOINTS.user.tasks.list),
            ApiService.get(ENDPOINTS.user.reviews.list),
            ApiService.get(`${ENDPOINTS.alerts.filter}?custom_conditions=[{"field": "alert_owner_id","operator":"in","value":["${userId}"]},{"field": "alert_status_id","operator":"not_in","value":[6,8,7]}]`)
        ];

        try {
            const results = await Promise.allSettled(api_requests);

            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    switch (index) {
                        case 0:
                            casesStore.set(result.value);
                            break;
                        case 1:
                            tasksStore.set(result.value);
                            break;
                        case 2:
                            reviewsStore.set(result.value);
                            break;
                        case 3:
                            alertsStore.set(result.value.alerts);
                            break;
                    }
                } else {
                    console.error(`Request ${index} failed:`, result.reason);
                }
            });

            isLoadingStore.set(false);
            isLoadingTasksStore.set(false);
            isLoadingReviewsStore.set(false);
            isLoadingAlertsStore.set(false);

        } catch (error) {
            console.error('Error loading initial data:', error);
        } finally {
            isLoadingStore.set(false);
            isLoadingTasksStore.set(false);
            isLoadingReviewsStore.set(false);
            isLoadingAlertsStore.set(false);
        }
    }

    $: activeView = $activeViewStore;

    function toggleView(key: string) {
        activeViewStore.set(activeView === key ? '' : key);
    }

    function handleTabChange(value: string) {
        if (value === 'overview') {
            activeViewStore.set('');
        }
        activeTab = value;
    }

    onMount(loadInitialData);
</script>

<div class="space-y-4">
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
                        value={key === 'cases' ? $casesStore.length : key === 'tasks' ? $tasksStore.length : key === 'reviews' ? $reviewsStore.length : key === 'alerts' ? $alertsStore.alerts?.length : 0}
                        subtitle={key === activeView ? 'Click to hide' : 'Click to view'}
                        isActive={key === activeView}
                        isLoading={key === 'cases' ? $isLoadingStore : key === 'tasks' ? $isLoadingTasksStore : key === 'reviews' ? $isLoadingReviewsStore : key === 'alerts' ? $isLoadingAlertsStore : false}
                        onClick={() => toggleView(key)}
                    />
                {/each}
            </div>
        
            {#if activeView && views[activeView].component}
                <svelte:component this={views[activeView].component} />
            {/if}
        </Tabs.Content>
    </Tabs.Root>
</div>
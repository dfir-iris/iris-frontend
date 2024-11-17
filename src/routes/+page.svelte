<script lang="ts">
    import { onMount } from 'svelte';
    import { activeViewStore } from '$lib/stores/active-view.store';
    import * as Tabs from "$lib/components/ui/tabs/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
    import Users from "lucide-svelte/icons/users";
    import DollarSign from "lucide-svelte/icons/dollar-sign";
    import CreditCard from "lucide-svelte/icons/credit-card";
    import Activity from "lucide-svelte/icons/activity";
    import BaseKpi from '$lib/components/ui/card/card-base-kpi.svelte';
    import UserCurrentTasksTable from './[components]/user-current-tasks-table.svelte';
    import { ClipboardCheck, Layers, ListTodo } from "lucide-svelte";
    import { casesStore, isLoadingStore } from '$lib/stores/cases.store';
    import { tasksStore, isLoadingTasksStore } from '$lib/stores/tasks.store';
    import { reviewsStore, isLoadingReviewsStore } from '$lib/stores/reviews.store';
    import CurrentUserCasesTable from './[components]/user-current-cases-table.svelte';
    import UserCurrentReviewsTable from './[components]/user-current-reviews-table.svelte';
    import { ApiService } from '$lib/services/api.service';


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
    };
   
    async function loadInitialData() {
        isLoadingStore.set(true);
        isLoadingTasksStore.set(true);
        isLoadingReviewsStore.set(true);
        
        try {
            const [casesResponse, tasksResponse, reviewsResponse] = await Promise.all([
                ApiService.get('/user/cases/list?cid=1&show_closed=false'),
                ApiService.get('/user/tasks/list'),
                ApiService.get('/user/reviews/list')
            ]);
            
            casesStore.set(casesResponse);
            tasksStore.set(tasksResponse);
            reviewsStore.set(reviewsResponse);

        } catch (error) {
            console.error('Error loading initial data:', error);
        } finally {
            isLoadingStore.set(false);
            isLoadingTasksStore.set(false);
            isLoadingReviewsStore.set(false);
        }
    }

    $: activeView = $activeViewStore;

    function toggleView(key: string) {
        activeViewStore.set(activeView === key ? '' : key);
    }

    function getKpiColor(count: number): string {
        return count === 0 ? 'bg-green-50 dark:bg-green-950/30' : 'bg-orange-50 dark:bg-orange-950/30';
    }

    onMount(loadInitialData);
</script>

<div class="space-y-4">
    <Tabs.Root value="overview" class="space-y-4">
        <Tabs.List>
            <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
            <Tabs.Trigger value="my_cases">Alerts</Tabs.Trigger>
            <Tabs.Trigger value="reports">Activities</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="overview" class="space-y-4">
            <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {#each Object.entries(views) as [key, view]}
                    <BaseKpi
                        title={view.title}
                        icon={view.icon}
                        value={key === 'cases' ? $casesStore.length : key === 'tasks' ? $tasksStore.length : '0'}
                        subtitle={key === activeView ? 'Click to hide' : 'Click to view'}
                        isActive={key === activeView}
                        isLoading={key === 'cases' ? $isLoadingStore : key === 'tasks' ? $isLoadingTasksStore : false}
                        bgColor={  key === 'tasks' ? getKpiColor($tasksStore.length) :
                                    key === 'reviews' ? getKpiColor($reviewsStore.length) : ''}
                        onClick={() => toggleView(key)}

                    />
                {/each}
            </div>
        
            {#if activeView && views[activeView].component}
                <svelte:component this={views[activeView].component} />
            {/if}
        </Tabs.Content>
        <Tabs.Content value="my_cases" class="space-y-4">
            <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card.Root>
                    <Card.Header
                        class="flex flex-row items-center justify-between space-y-0 pb-2"
                    >
                        <Card.Title class="text-sm font-medium">Open cases</Card.Title>
                        <DollarSign class="text-muted-foreground h-4 w-4" />
                    </Card.Header>
                    <Card.Content>
                        <div class="text-2xl font-bold"></div>
                        <p class="text-muted-foreground text-xs">+20.1% from last month</p>
                    </Card.Content>
                </Card.Root>
                <Card.Root>
                    <Card.Header
                        class="flex flex-row items-center justify-between space-y-0 pb-2"
                    >
                        <Card.Title class="text-sm font-medium">Subscriptions</Card.Title>
                        <Users class="text-muted-foreground h-4 w-4" />
                    </Card.Header>
                    <Card.Content>
                        <div class="text-2xl font-bold">+2350</div>
                        <p class="text-muted-foreground text-xs">+180.1% from last month</p>
                    </Card.Content>
                </Card.Root>
                <Card.Root>
                    <Card.Header
                        class="flex flex-row items-center justify-between space-y-0 pb-2"
                    >
                        <Card.Title class="text-sm font-medium">Sales</Card.Title>
                        <CreditCard class="text-muted-foreground h-4 w-4" />
                    </Card.Header>
                    <Card.Content>
                        <div class="text-2xl font-bold">+12,234</div>
                        <p class="text-muted-foreground text-xs">+19% from last month</p>
                    </Card.Content>
                </Card.Root>
                <Card.Root>
                    <Card.Header
                        class="flex flex-row items-center justify-between space-y-0 pb-2"
                    >
                        <Card.Title class="text-sm font-medium">Active Now</Card.Title>
                        <Activity class="text-muted-foreground h-4 w-4" />
                    </Card.Header>
                    <Card.Content>
                        <div class="text-2xl font-bold">+573</div>
                        <p class="text-muted-foreground text-xs">+201 since last hour</p>
                    </Card.Content>
                </Card.Root>
            </div>
        </Tabs.Content>
    </Tabs.Root>
</div>
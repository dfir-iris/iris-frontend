<script lang="ts">
    import { username } from '$lib/stores/auth.store';
    import * as Tabs from "$lib/components/ui/tabs/index.js";
	import * as Card from "$lib/components/ui/card/index.js";
    import Users from "lucide-svelte/icons/users";
    import DollarSign from "lucide-svelte/icons/dollar-sign";
    import CreditCard from "lucide-svelte/icons/credit-card";
    import Activity from "lucide-svelte/icons/activity";
    import CaseCountKpi  from './[components]/user-case-count-kpi.svelte';
    
    import CurrentUserCasesTable from './[components]/user-current-cases-table.svelte';

  const AllCommunityModules = [];
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
                <CaseCountKpi />

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
            <div class="grid gap-4 md:grid-cols-1 lg:grid-cols-1">
                <CurrentUserCasesTable />
            </div>
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
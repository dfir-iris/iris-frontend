<script lang="ts">
    import { mount } from 'svelte';
    import { Button } from "$lib/components/ui/button";
    import { RefreshCw } from "lucide-svelte";
    import * as Card from "$lib/components/ui/card/index.js";
    import DataTable from '$lib/components/ui/data-table/data-table.svelte';
    import { ApiService } from '$lib/services/api.service';
    import { Skeleton } from "$lib/components/ui/skeleton";
    import { tasksStore, isLoadingTasksStore } from '$lib/stores/tasks.store';
    import { cellRendererFactory } from '$lib/components/ui/data-table/cell-renderer-factory';
    import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
    import { TimeFormatter } from '$lib/utils/time-formatter';
    
    let columnDefs = [
        {
            field: 'task_title',
            headerName: 'Title',
            sortable: true,
            filter: true
        },
        {
            field: 'task_open_date',
            headerName: 'Opening Date',
            sortable: true,
            filter: true,
            valueFormatter: (params: any) => {
                return TimeFormatter.format(params.value, {
                    timezone: 'Europe/Paris',
                    format: 'medium',
                    locale: 'fr-FR',
                });
            }
        },
        { 
            field: 'case.case_name', 
            headerName: 'Related Case', 
            sortable: true, 
            filter: true 
        },
        { 
            field: 'status.status_name', 
            headerName: 'Status',
            filter: 'agTextColumnFilter',
            filterParams: {
                maxNumConditions: 3,
                textMatcher: ({ filterOption, value, filterText }: { filterOption: any, value: string, filterText: string }) => {
                    return value === filterText;
                }
            },  
            sortable: true, 
            cellRenderer: (params: any) => {
                return cellRendererFactory((target, p) => {
                    const status = p?.data?.status?.status_name;
                    mount(StatusBadge, {
                    target,
                    props: {
                        status,
                    },
                    });
                })(params);
                },
        }
    ];

    let quickFilters = [
        {
            field: 'status.status_name',
            label: 'Status',
            options: [
                { value: 'To do', label: 'To do' },
                { value: 'In progress', label: 'In Progress' },
                { value: 'Pending', label: 'Pending' },
                { value: 'On hold', label: 'On hold' },
                { value: 'Done', label: 'Done' },
            ]
        }
    ];

    async function fetchTasks() {
        isLoadingTasksStore.set(true);
        try {
            const response_data = await ApiService.get('/user/tasks/list');
            tasksStore.set(response_data);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        } finally {
            isLoadingTasksStore.set(false);
        }
    }

</script>

<Card.Root>
    <Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
        <Card.Title class="text-sm font-medium">Pending Tasks</Card.Title>
        <Button variant="ghost" size="icon" on:click={fetchTasks}>
            <RefreshCw class="h-4 w-4" />
        </Button>
    </Card.Header>
    <Card.Content class="items-center justify-between pb-2">
        {#if $isLoadingTasksStore}
            <div class="space-y-2">
                {#each Array(5) as _}
                    <div class="grid grid-cols-3 gap-4">
                        <Skeleton class="h-8" />
                        <Skeleton class="h-8" />
                        <Skeleton class="h-8" />
                    </div>
                {/each}
            </div>
        {:else}
            <DataTable 
                rowData={$tasksStore} 
                {columnDefs} 
                {quickFilters}
            />
        {/if}
    </Card.Content>
</Card.Root>
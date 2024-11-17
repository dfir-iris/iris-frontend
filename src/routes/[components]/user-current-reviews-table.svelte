<script lang="ts">
    import { mount } from 'svelte';
    import { Button } from "$lib/components/ui/button";
    import { RefreshCw } from "lucide-svelte";
    import * as Card from "$lib/components/ui/card/index.js";
    import DataTable from '$lib/components/ui/data-table/data-table.svelte';
    import { ApiService } from '$lib/services/api.service';
    import { Skeleton } from "$lib/components/ui/skeleton";
    import { reviewsStore, isLoadingReviewsStore } from '$lib/stores/reviews.store';
    import { cellRendererFactory } from '$lib/components/ui/data-table/cell-renderer-factory';
    import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
    
    let columnDefs = [
        {
            field: 'case_name',
            headerName: 'Case',
            sortable: true,
            filter: true
        },
        { 
            field: 'status_name', 
            headerName: 'Status', 
            sortable: true,
            filter: true,
            cellRenderer: (params: any) => {
                return cellRendererFactory((target, p) => {
                    mount(StatusBadge, {
                        target,
                        props: {
                            status: p.value
                        }
                    });
                })(params);
            }
        }
    ];

    let quickFilters = [
        {
            field: 'status_name',
            label: 'Status',
            options: [
                { value: 'Pending', label: 'Pending' },
                { value: 'Approved', label: 'Approved' },
                { value: 'Rejected', label: 'Rejected' }
            ]
        }
    ];

    async function loadInitialData() {
        isLoadingReviewsStore.set(true);

        try {
            const reviewsResponse = await ApiService.get('/user/reviews/list');
            reviewsStore.set(reviewsResponse);
        } catch (error) {
            console.error('Error loading initial data:', error);
        } finally {
            isLoadingReviewsStore.set(false);
        }
    }

</script>

<Card.Root>
    <Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
        <Card.Title class="text-sm font-medium">Pending Reviews</Card.Title>
        <Button variant="ghost" size="icon" on:click={loadInitialData}>
            <RefreshCw class="h-4 w-4" />
          </Button>
    </Card.Header>
    <Card.Content class="items-center justify-between pb-2">
        {#if $isLoadingReviewsStore}
            <div class="space-y-2">
                {#each Array(5) as _}
                    <div class="grid grid-cols-2 gap-4">
                        <Skeleton class="h-8" />
                        <Skeleton class="h-8" />
                    </div>
                {/each}
            </div>
        {:else}
            <DataTable 
                rowData={$reviewsStore}
                {columnDefs}
                {quickFilters}
            />
        {/if}
    </Card.Content>
</Card.Root>
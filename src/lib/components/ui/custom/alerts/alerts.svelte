<!-- src/routes/(app)/alerts/+page.svelte -->
<script lang="ts">
    import { onMount } from 'svelte';
    import { alertsStore, isLoadingAlertsStore } from '$lib/stores/alerts.store';
    import AlertsList from '$lib/components/ui/custom/alerts/alerts_list.svelte';
    import AlertView from '$lib/components/ui/custom/alerts/alert_view.svelte';
    import * as Resizable from "$lib/components/ui/resizable";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import { Skeleton } from "$lib/components/ui/skeleton";
    import LoadingButton from '$lib/components/ui/loading-button/loading-button.svelte';
    import Separator from '$lib/components/ui/separator/separator.svelte';
	import { invalidate } from '$app/navigation';

    export let data: { alerts: any[] };

    // Destructure alerts from the page store's data
    let alerts = data.alerts;

    onMount(() => {
        console.log('Alerts:', alerts);
        alertsStore.set(alerts);
        isLoadingAlertsStore.set(false);
    });

    async function fetchAlerts() {
        isLoadingAlertsStore.set(true);
        try {
            // Invalidate the data 
            invalidate('app:alert_filter');
        } catch (error) {
            console.error('Error fetching alerts:', error);
        } finally {
            isLoadingAlertsStore.set(false);
        }
    }
</script>

<div class="hidden md:block">
    <div class="flex items-center px-4 py-2">
        <LoadingButton
            variant="outline"
            class="ml-2"
            loading={$isLoadingAlertsStore}
            on:click={fetchAlerts}
        >
            Refresh
        </LoadingButton>
    </div>
    <Separator class="mb-4"/>
    <Resizable.PaneGroup
        direction="horizontal"
        class="items-stretch"
    >
        <Resizable.Pane
            defaultSize={30}
            collapsible
            minSize={7}
            maxSize={70}
        >
            {#if $isLoadingAlertsStore}
                <div class="p-4">
                    <Skeleton class="h-20 w-full mt-2 bg-gray-100" />
                    <Skeleton class="h-20 w-full mt-2 bg-gray-100" />
                    <Skeleton class="h-20 w-full mt-2 bg-gray-100" />
                    <Skeleton class="h-20 w-full mt-2 bg-gray-100" />
                    <Skeleton class="h-20 w-full mt-2 bg-gray-100" />
                    <Skeleton class="h-20 w-full mt-2 bg-gray-100" />
                    <Skeleton class="h-20 w-full mt-2 bg-gray-100" />
                </div>  
            {:else}
                {#if alerts.length === 0}
                    <p>No alerts found.</p>
                {:else}
                    <AlertsList items={alerts} />
                {/if}
            {/if}
        </Resizable.Pane>
        <Resizable.Handle withHandle />
        <Resizable.Pane minSize={10}>
            <ScrollArea class="h-screen">
                {#if $alertsStore.selected}
                    <AlertView alert={$alertsStore.selected} />
                {:else}
                    <div class="flex items-center justify-center h-full">
                        <p>Select an alert to view details.</p>
                    </div>        	
                {/if}
            </ScrollArea>
        </Resizable.Pane>
    </Resizable.PaneGroup>
</div>

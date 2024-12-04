<script lang="ts">
    import { onMount } from 'svelte';
    import { alertsStore, isLoadingAlertsStore } from '$lib/stores/alerts.store';
    import { ApiService } from '$lib/services/api.service';
    import AlertsList from '$lib/components/ui/custom/alerts/alerts_list.svelte';
    import AlertView from '$lib/components/ui/custom/alerts/alert_view.svelte';
	import * as Resizable  from "$lib/components/ui/resizable";
    import { ScrollArea } from "$lib/components/ui/scroll-area";
    import { Skeleton } from "$lib/components/ui/skeleton";
	import LoadingButton from '$lib/components/ui/loading-button/loading-button.svelte';
	import { RefreshCwIcon } from 'lucide-svelte';
	import Separator from '$lib/components/ui/separator/separator.svelte';

    // export let endpoint_url = "";
    // export let do_fetch = true;

    export let alerts: any[];

    onMount(() => {
        console.log('Alerts:', alerts);
        alertsStore.set(alerts);
        isLoadingAlertsStore.set(false);
    });

    async function fetchAlerts() {
        isLoadingAlertsStore.set(true);
        try {
            const response = await fetch('/alerts');
            const data = await response.json();
            alertsStore.set(data.alerts);
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
            {#if $alertsStore.alerts.length === 0}
                <p>No alerts found.</p>
            {:else}
                <AlertsList items={$alertsStore.alerts} />
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
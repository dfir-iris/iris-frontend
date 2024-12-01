<script lang="ts">
	import { isLoadingAlertsStore } from '$lib/stores/alerts.store';
    import { Skeleton } from "$lib/components/ui/skeleton";
    import { ENDPOINTS } from '$lib/constants/endpoints';
	import Alerts from '$lib/components/ui/custom/alerts/alerts.svelte';
    import { current_user } from '$lib/stores/auth.store';

    let userId: number;
    current_user.subscribe(user => {
        if (user) {
            userId = user.id;
        }
    });

    let url = `${ENDPOINTS.alerts.filter}?custom_conditions=[{"field": "alert_owner_id","operator":"in","value":["${userId}"]},{"field": "alert_status_id","operator":"not_in","value":[6,8,7]}]`;

</script>

{#if $isLoadingAlertsStore}
    <Skeleton class="h-8 w-[100px]" />
    <Skeleton class="h-4 w-[70px] mt-2" />
{:else}
    <Alerts do_fetch={false}/>
{/if}
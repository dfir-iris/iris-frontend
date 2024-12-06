<script lang="ts">
	import { isLoadingAlertsStore } from '$lib/stores/alerts.store';
    import { Skeleton } from "$lib/components/ui/skeleton";
    import { ENDPOINTS } from '$lib/constants/endpoints';
	import Alerts from '$lib/components/ui/custom/alerts/alerts.svelte';
    import { current_user } from '$lib/stores/auth.store';

    export let data: any = [];

</script>

{#if $isLoadingAlertsStore}
    <Skeleton class="h-8 w-[100px]" />
    <Skeleton class="h-4 w-[70px] mt-2" />
{:else}
    <Alerts {...data} />
{/if}
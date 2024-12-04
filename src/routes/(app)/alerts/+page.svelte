<script lang="ts">
	import Alert from '$lib/components/ui/custom/alerts/alerts.svelte';

	export let data: { alerts: any[] };

</script>

<Alert {data} />


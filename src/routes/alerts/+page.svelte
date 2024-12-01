<script lang="ts">
	import Alert from '$lib/components/ui/custom/alerts/alerts.svelte';
	import { ENDPOINTS } from '$lib/constants/endpoints';

</script>

<Alert endpoint_url={ENDPOINTS.alerts.filter} />


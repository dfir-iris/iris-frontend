<script lang="ts">
	import type { PageData } from './$types';
	import Alert from '$lib/components/ui/custom/alerts/alerts.svelte';

	let { data }: { data: PageData } = $props();

</script>

<Alert {data} />


<script lang="ts">
	import { page } from '$app/state';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>#{page.params.case_id} - War Room</title>
</svelte:head>

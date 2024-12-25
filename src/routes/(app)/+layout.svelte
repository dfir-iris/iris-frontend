<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import Topbar from '$lib/layouts/Topbar.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<svelte:head>
	<title>Dashboard | DFIR-IRIS</title>
</svelte:head>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-muted">
	<Topbar></Topbar>
	{@render children()}
</div>

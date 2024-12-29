<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import Topbar from '$lib/components/navigation/Topbar.svelte';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<svelte:head>
	<title>Dashboard | DFIR-IRIS</title>
</svelte:head>

<div class="flex h-screen w-screen flex-col overflow-hidden bg-muted dark:bg-background">
	<Topbar></Topbar>
	{@render children()}
</div>

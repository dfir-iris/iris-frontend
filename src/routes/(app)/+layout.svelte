<script lang="ts">
	import type { Snippet } from 'svelte';
	import TopBar from '$lib/components/navigation/TopBar.svelte';
	import { SideBar } from '$lib/components/navigation/SideBar';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<title>Dashboard | DFIR-IRIS</title>
</svelte:head>

<div class="fixed m-0 flex h-screen w-screen overflow-auto dark:bg-background">
	<SideBar />

	<main class="w-full">
		<TopBar></TopBar>

		{@render children()}
	</main>
</div>

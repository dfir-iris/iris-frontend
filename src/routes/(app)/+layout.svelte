<script lang="ts">
	import type { Snippet } from 'svelte';
	import Topbar from '$lib/components/navigation/Topbar.svelte';
	import { SideBar } from '$lib/components/navigation/SideBar';

	let { children }: { children: Snippet } = $props();
</script>

<svelte:head>
	<title>Dashboard | DFIR-IRIS</title>
</svelte:head>

<div class="fixed m-0 flex h-screen w-screen overflow-auto dark:bg-background">
	<SideBar />

	<main class="w-full">
		<Topbar></Topbar>

		{@render children()}
	</main>
</div>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { SideBar } from '$lib/components/navigation/SideBar';
	import TopBar from '$lib/components/navigation/TopBar/TopBar.svelte';

	let { children }: { children: Snippet } = $props();
</script>

<div class="flex h-screen w-full overflow-hidden dark:bg-background">
	<SideBar />

	<main class="flex min-w-0 grow flex-col">
		<TopBar />

		<div class="flex min-w-0 grow overflow-auto">
			{@render children()}
		</div>
	</main>
</div>

<script lang="ts">
	import { FileLock2Icon } from 'lucide-svelte';
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>#{page.params.case_id} - Evidence</title>
</svelte:head>

<div class="flex h-full w-full flex-col items-center justify-center">
	<FileLock2Icon size={72} class="mx-auto mt-auto text-blue-800 dark:text-blue-600" />
	<h1 class="my-4 text-center">No evidence selected</h1>
	<p class="mb-auto text-center">Select or add one from the side.</p>
</div>

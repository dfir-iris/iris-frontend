<script>
	import { ComputerIcon } from 'lucide-svelte';
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>#{page.params.case_id} - Assets</title>
</svelte:head>

<div class="flex h-full w-full flex-col items-center justify-center">
	<ComputerIcon size={72} class="text-blue-800 dark:text-blue-600" />
	<h1 class="my-4 text-center">No asset selected</h1>
	<p class="">Select or add one from the side.</p>
</div>

<script lang="ts">
	import { page } from '$app/state';
	import { ExternalLinkIcon, TrafficConeIcon } from 'lucide-svelte';
</script>

<div class="flex h-full w-full flex-col items-center justify-center gap-y-2">
	<TrafficConeIcon size={72} class="text-blue-800 dark:text-blue-600" />
	<h1>Error {page.status}</h1>
	<h2>{page.error?.message}</h2>
	<p>Our apologies.</p>
	<!-- TODO: ADD LINK -->
	<a
		href="https://github.com/dfir-iris/iris-web/issues"
		class="flex flex-row items-center gap-x-1 underline"
		>Report an issue on our GitHub <ExternalLinkIcon size={16} /></a
	>
</div>

<script lang="ts">
	import type { PageData } from './$types';
	import { page } from '$app/state';
	import { appContext } from '$lib/stores/appContext.store';

	let { data }: { data: PageData } = $props();

	$inspect(data);

	$effect(() => {
		const case_id = page.params.case_id;
		if (!case_id) return;

		const currentCaseID = Number(case_id);
		if (!Number.isInteger(currentCaseID)) return;

		appContext.update((current) =>
			current.currentCaseID === currentCaseID ? current : { ...current, currentCaseID }
		);
	});
</script>

<!-- Overview info -->
<div class="flex w-full flex-col border-b bg-muted/20 p-4">
	{#await data.case}
		loader
	{/await}
</div>

<script lang="ts">
	import type { PageData } from './$types';
	import { page } from '$app/state';
	import { appContext } from '$lib/stores/appContext.store';
	import type { Case } from '$lib/types/resources/case';

	let { data }: { data: PageData } = $props();
	let currentCase: Case | null = $state(null);

	$inspect(data);

	$effect(() => {
		const case_id = page.params.case_id;
		if (!case_id) return;

		const currentCaseID = Number(case_id);
		if (!Number.isInteger(currentCaseID)) return;

		appContext.update((current) =>
			current.currentCaseID === currentCaseID ? current : { ...current, currentCaseID }
		);

		(async () => (currentCase = (await data.case).data as Case))();
	});
</script>

<svelte:head>
	<title>Case #{data.caseId} | IRIS</title>
</svelte:head>

<div class="flex flex-col border-b bg-muted/20 p-4">
	{#if currentCase}
		<!-- use it here -->
		<div>{currentCase.case_name}</div>
	{:else}
		<div>Loading...</div>
	{/if}
</div>

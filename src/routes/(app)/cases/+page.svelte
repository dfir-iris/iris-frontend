<script lang="ts">
	import CasesDataTable from '$lib/components/common/cases-data-table.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Cases | DFIR-IRIS</title>
</svelte:head>

<div class="flex h-full flex-col gap-y-6 p-8">
	<h1>Cases</h1>

	<CasesDataTable cases={data.cases}></CasesDataTable>
</div>

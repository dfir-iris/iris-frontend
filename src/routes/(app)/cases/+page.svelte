<script lang="ts">
	import { page } from '$app/state';
	import CasesDataTable from '$lib/components/common/cases-data-table.svelte';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Cases | DFIR-IRIS</title>
</svelte:head>

<div class="flex h-full flex-col gap-y-6 p-8">
	<div class="flex flex-row items-center">
		<h1>Cases</h1>

		<div class="ml-auto"></div>
		<Searchbar placeholder="Search cases" bind:value={page.url.searchParams.search}></Searchbar>
		<!-- FIXME: need to add a store that maps to URL params -->
	</div>

	<CasesDataTable cases={data.cases}></CasesDataTable>
</div>

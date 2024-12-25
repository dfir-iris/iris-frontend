<script lang="ts">
	import { page } from '$app/state';
	import CasesDataTable from '$lib/components/common/cases-data-table.svelte';
	import { Button } from '$lib/components/ui/button';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import { PlusIcon } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Cases | DFIR-IRIS</title>
</svelte:head>

<div class="flex h-full flex-col gap-y-6 p-8">
	<div class="flex flex-row items-center gap-x-4">
		<h1>Cases</h1>

		<div class="ml-auto"></div>
		<Searchbar placeholder="Search cases" bind:value={page.url.searchParams.search}></Searchbar>
		<!-- FIXME: need to add a store that maps to URL params -->
		<Button href="/case/open">
			<PlusIcon />
			Open Case
		</Button>
	</div>

	<CasesDataTable class="h-full" cases={data.cases}></CasesDataTable>
</div>

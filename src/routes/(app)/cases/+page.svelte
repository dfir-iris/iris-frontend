<script lang="ts">
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { getContext } from 'svelte';

	import CasesDataTable from '$lib/components/common/cases-data-table.svelte';
	import { Button } from '$lib/components/ui/button';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import { PlusIcon } from 'lucide-svelte';

	import { CaseService, type ListCasesParams } from '$lib/services/case.service';
	import type { RequestResponse, Paginated } from '$lib/services/api.service';
	import type { Case } from '$lib/types/resources/case';

	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';

	const cases = getContext<CasesContext>(CASES_CTX);

	let search = $state('');
	let currentPage = $state(1);
	let casesPaginated = $state<Promise<RequestResponse<Paginated<Case>>> | null>(null);

	function updateUrl(params: { search?: string; page?: number }) {
		const url = new URL(page.url);

		if (params.search !== undefined) {
			const s = params.search.trim();
			if (s === '') url.searchParams.delete('search');
			else url.searchParams.set('search', s);
		}

		if (params.page !== undefined) {
			if (params.page <= 1) url.searchParams.delete('page');
			else url.searchParams.set('page', String(params.page));
		}

		const nextHref = `${url.pathname}${url.search}`;
		const curHref = `${page.url.pathname}${page.url.search}`;
		if (nextHref === curHref) return;

		void goto(nextHref, { replaceState: true, keepFocus: true, noScroll: true });
	}

	$effect(() => {
		const urlSearch = page.url.searchParams.get('search') ?? '';
		const urlPage = Number(page.url.searchParams.get('page') ?? '1') || 1;

		search = urlSearch;
		currentPage = urlPage;

		const params: ListCasesParams = {
			page: urlPage,
			case_name: urlSearch || undefined
		};

		casesPaginated = CaseService.list(params);

		cases.load(params);
	});

	let didInitSearch = false;
	let debounce: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		const searchParam = search;

		if (!didInitSearch) {
			didInitSearch = true;

			return;
		}

		if (debounce) clearTimeout(debounce);

		debounce = setTimeout(() => {
			updateUrl({ search: searchParam, page: 1 });
		}, 250);
	});
</script>

<svelte:head>
	<title>Cases | DFIR-IRIS</title>
</svelte:head>

<div class="flex grow flex-col gap-4 p-4">
	<div class="flex flex-row items-center gap-4">
		<h1>Cases</h1>

		<div class="ml-auto"></div>

		<Searchbar placeholder="Search cases" bind:value={search} />

		<Button onclick={() => (cases.ui.showAddModal = true)}>
			<PlusIcon />
			Open Case
		</Button>
	</div>

	{#if casesPaginated}
		<CasesDataTable class="flex grow" cases={casesPaginated} />
	{/if}
</div>

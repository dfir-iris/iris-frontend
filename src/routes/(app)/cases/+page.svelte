<script lang="ts">
	import { PlusIcon } from 'lucide-svelte';
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { Button } from '$lib/components/ui/button';
	import Label from '$lib/components/ui/label/label.svelte';
	import Checkbox from '$lib/components/ui/checkbox/checkbox.svelte';
	import Searchbar from '$lib/components/ui/searchbar/searchbar.svelte';
	import CasesDataTable from '$lib/components/common/cases-data-table.svelte';
	import type { RequestResponse, Paginated } from '$lib/services/api.service';
	import type { Case } from '$lib/types/resources/case';
	import { CASES_CTX, type CasesContext } from '$lib/contexts/cases.context.svelte';

	const cases = getContext<CasesContext>(CASES_CTX);

	let search = $state('');
	let showClosed = $state(false);
	let currentPage = $state(1);
	let casesPaginated = $state<Promise<RequestResponse<Paginated<Case>>> | null>(null);

	const updateUrl = (params: { search?: string; page?: number; showClosed?: boolean }) => {
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

		if (params.showClosed !== undefined) {
			if (!params.showClosed) url.searchParams.delete('show_closed');
			else url.searchParams.set('show_closed', '1');
		}

		const nextHref = `${url.pathname}${url.search}`;
		const curHref = `${page.url.pathname}${page.url.search}`;
		if (nextHref === curHref) return;

		void goto(nextHref, { replaceState: true, keepFocus: true, noScroll: true });
	};

	$effect(() => {
		const urlSearch = page.url.searchParams.get('search') ?? '';
		const urlPage = Number(page.url.searchParams.get('page') ?? '1') || 1;
		const urlShowClosed = (page.url.searchParams.get('show_closed') ?? '') === '1';

		search = urlSearch;
		currentPage = urlPage;
		showClosed = urlShowClosed;

		const params = {
			page: urlPage,
			per_page: 10,
			case_name: urlSearch.trim() === '' ? undefined : urlSearch.trim(),
			is_open: urlShowClosed ? undefined : true
		};

		casesPaginated = cases.listPaginated(params);
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
		<h1>{showClosed ? 'All Cases' : 'Open Cases'}</h1>

		<div class="ml-auto"></div>

		<div class="flex items-center space-x-2 rounded p-1 hover:bg-muted/50">
			<Checkbox
				id="show_closed"
				checked={showClosed}
				onCheckedChange={(checked) => updateUrl({ showClosed: checked === true, page: 1 })}
			/>

			<Label for="show_closed" class="w-full cursor-pointer text-sm font-normal">
				Show closed cases
			</Label>
		</div>

		<Searchbar placeholder="Search cases" bind:value={search} />

		<Button onclick={() => (cases.ui.showAddModal = true)}>
			<PlusIcon />
			Open Case
		</Button>
	</div>

	{#if casesPaginated}
		<CasesDataTable
			class="flex grow"
			cases={casesPaginated}
			page={currentPage}
			onPageChange={(p) => updateUrl({ page: p })}
		/>
	{/if}
</div>

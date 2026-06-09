<script lang="ts">
	import type { Asset } from '$lib/types/resources/asset';
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import { LinkCell } from '$lib/components/ui/table';

	export let assets: Asset[] = [];
	export let caseId: string | number | null = null;
	export let className: string = '';
	export let totalPages: number | null = null;
	export let tablePage: number | null = null;
	export let perPage: number = 10;

	import { page } from '$app/stores';

	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	let currentPage: number = (tablePage ?? $page.data.assets?.current_page) || 1;
	let prevPage = currentPage;
	$: if (tablePage != null && tablePage !== currentPage) {
		currentPage = tablePage;
		prevPage = tablePage;
	}
	$: if (currentPage !== prevPage) {
		prevPage = currentPage;
		dispatch('pageChange', { page: currentPage });
	}

	let currentPageSize: number = perPage;
	let prevPageSize = currentPageSize;
	$: if (perPage !== currentPageSize && perPage !== prevPageSize) {
		currentPageSize = perPage;
		prevPageSize = perPage;
	}
	$: if (currentPageSize !== prevPageSize) {
		prevPageSize = currentPageSize;
		dispatch('pageSizeChange', { pageSize: currentPageSize });
	}

	const columns: ColumnDef<Asset>[] = [
		{
			accessorKey: 'asset_name',
			header: () => 'Name',
			...(caseId != null && {
				cell: (cell) =>
					renderComponent(LinkCell, {
						href: `/case/${caseId}/assets/${cell.row.original.asset_id}`,
						label: `${cell.getValue()}`
					})
			})
		},
		{
			accessorKey: 'asset_type.asset_name',
			header: () => 'Type'
		},
		{
			accessorKey: 'asset_ip',
			header: () => 'IP'
		},
		{
			accessorKey: 'asset_domain',
			header: () => 'Domain'
		},
		{
			accessorKey: 'asset_tags',
			header: () => 'Tags',
			cell: (cell) => cell.getValue() || '-'
		}
	];
</script>

<div class="{className} flex overflow-auto">
	{#if !assets || assets.length === 0}
		<div class="w-full p-4 text-center">
			<p>No assets to display.</p>
		</div>
	{:else}
		<DataTable
			{columns}
			data={assets}
			bind:page={currentPage}
			bind:pageSize={currentPageSize}
			totalPages={totalPages ?? undefined}
		></DataTable>
	{/if}
</div>

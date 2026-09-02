<script lang="ts">
	import type { Asset } from '$lib/types/resources/asset';
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import { LinkCell } from '$lib/components/ui/table';
	import RowCheckbox from '$lib/components/common/RowCheckbox.svelte';

	export let assets: Asset[] = [];
	export let caseId: string | number | null = null;
	export let className: string = '';
	export let totalPages: number | null = null;
	export let tablePage: number | null = null;
	export let perPage: number = 10;
	export let selectionMode: boolean = false;
	export let selectedAssets: Set<number> = new Set();
	export let onToggleSelect: ((id: number) => void) | undefined = undefined;

	import { page } from '$app/stores';

	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	// Page state sync. Two-way binding with the DataTable's internal page,
	// plus dispatching `pageChange` upward so the parent can refetch.
	//
	// The naive reactive sync (`if tablePage !== currentPage, override`) races
	// with the user's click: clicking ">" sets currentPage=2, but tablePage is
	// still 1 until the server responds, so the reactive block immediately
	// snaps currentPage back to 1 and the click appears to do nothing.
	//
	// Fix: track the last `tablePage` value we accepted. Only honor an external
	// `tablePage` change when it differs from BOTH currentPage and that last
	// acknowledged value — i.e., only when the parent genuinely pushed a new
	// page (e.g. on view-mode reset), not when it's lagging behind our click.
	let currentPage: number = (tablePage ?? $page.data.assets?.current_page) || 1;
	let lastTablePage: number | null = tablePage ?? null;
	$: if (tablePage != null && tablePage !== lastTablePage && tablePage !== currentPage) {
		currentPage = tablePage;
		lastTablePage = tablePage;
	} else if (tablePage != null && tablePage !== lastTablePage) {
		// Parent caught up to our local value — acknowledge without overriding.
		lastTablePage = tablePage;
	}

	let prevPage = currentPage;
	$: if (currentPage !== prevPage) {
		prevPage = currentPage;
		dispatch('pageChange', { page: currentPage });
	}

	let currentPageSize: number = perPage;
	let lastPerPage = perPage;
	$: if (perPage !== lastPerPage && perPage !== currentPageSize) {
		currentPageSize = perPage;
		lastPerPage = perPage;
	} else if (perPage !== lastPerPage) {
		lastPerPage = perPage;
	}

	let prevPageSize = currentPageSize;
	$: if (currentPageSize !== prevPageSize) {
		prevPageSize = currentPageSize;
		dispatch('pageSizeChange', { pageSize: currentPageSize });
	}

	const dataColumns: ColumnDef<Asset>[] = [
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

	// Rebuild columns when selection state changes so checkbox checked reflects current set.
	$: columns = selectionMode
		? [
				{
					id: '__select__',
					header: () => '',
					meta: { thClass: 'w-8 pr-0', tdClass: 'w-8 pr-0' },
					cell: (cell: import('@tanstack/svelte-table').CellContext<Asset, unknown>) =>
						renderComponent(RowCheckbox, {
							checked: selectedAssets.has(cell.row.original.asset_id),
							onToggle: () => onToggleSelect?.(cell.row.original.asset_id)
						})
				} as ColumnDef<Asset>,
				...dataColumns
			]
		: dataColumns;
</script>

<div class="{className} flex overflow-auto">
	{#if !assets || assets.length === 0}
		<div class="w-full p-4 text-center">
			<p>No assets to display.</p>
		</div>
	{:else}
		<DataTable
			columns={columns as import('@tanstack/svelte-table').ColumnDef<unknown>[]}
			data={assets}
			bind:page={currentPage}
			bind:pageSize={currentPageSize}
			totalPages={totalPages ?? undefined}
		></DataTable>
	{/if}
</div>

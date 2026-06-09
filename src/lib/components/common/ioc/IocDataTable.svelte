<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import { page } from '$app/stores';
	import type { Ioc } from '$lib/types/resources/ioc';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import TlpBadge from '../tlp/TlpBadge.svelte';
	import IocNameCell from './IocNameCell.svelte';

	export let iocs: Ioc[];
	export let caseId: string | number | null = null;
	export let className: string = '';
	export let totalPages: number | null = null;
	export let tablePage: number | null = null;
	export let perPage: number = 10;

	const dispatch = createEventDispatcher();

	let currentPage: number = (tablePage ?? $page.data.iocs?.current_page) || 1;
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

	const columns: ColumnDef<Ioc>[] = [
		{
			accessorKey: 'ioc_value',
			header: () => 'Name',
			meta: { tdClass: 'max-w-0' },
			cell: (cell) => {
				const ioc = cell.row.original;
				if (caseId != null) {
					return renderComponent(IocNameCell, {
						href: `/case/${caseId}/iocs/${ioc.ioc_id}`,
						id: ioc.ioc_id,
						value: ioc.ioc_value
					});
				}
				return ioc.ioc_value;
			}
		},
		{
			accessorKey: 'ioc_type.type_name',
			header: () => 'Type',
			meta: { thClass: 'w-1/4' },
			cell: (cell) => cell.getValue() || '-'
		},
		{
			accessorKey: 'tlp.tlp_name',
			header: () => 'TLP',
			meta: { thClass: 'w-[30%]' },
			cell: (cell) => {
				const tlpName = cell.getValue() as string;
				return renderComponent(TlpBadge, { tlp_name: tlpName });
			}
		}
	];
</script>

<div class="{className} flex overflow-auto">
	{#if !iocs || iocs.length === 0}
		<div class="w-full p-4 text-center">
			<p>No IOCs to display.</p>
		</div>
	{:else}
		<DataTable
			columns={columns as ColumnDef<unknown>[]}
			tableClass="w-full table-fixed text-xs"
			data={iocs}
			bind:page={currentPage}
			bind:pageSize={currentPageSize}
			totalPages={totalPages ?? undefined}
		/>
	{/if}
</div>

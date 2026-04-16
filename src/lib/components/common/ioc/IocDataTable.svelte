<script lang="ts">
	import type { Ioc } from '$lib/types/resources/ioc';
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import { LinkCell } from '$lib/components/ui/table';

	export let iocs: Ioc[];
	export let caseId: string | number | null = null;
	export let className: string = '';
	export let totalPages: number | null = null;
	// page number prop for this table (renamed to avoid collision with $page store)
	export let tablePage: number | null = null;

	// import SvelteKit page store for fallback when parent doesn't pass tablePage
	import { page } from '$app/stores';

	import { createEventDispatcher } from 'svelte';
	import TlpBadge from '../tlp/TlpBadge.svelte';
	const dispatch = createEventDispatcher();

	// Columns configuration for IOCs
	const columns: ColumnDef<Ioc>[] = [
		{
			accessorKey: 'ioc_value',
			header: () => 'Value',
			...(caseId != null && {
				cell: (cell) =>
					renderComponent(LinkCell, {
						href: `/case/${caseId}/iocs/${cell.row.original.ioc_id}`,
						label: `${cell.getValue()}`
					})
			})
		},
		{
			accessorKey: 'ioc_type.type_name',
			header: () => 'Type'
		},
		{
			accessorKey: 'tlp.tlp_name',
			header: () => 'TLP',
			cell: (cell) => {
				const tlpName = cell.getValue() as string;
				return renderComponent(TlpBadge, { tlp_name: tlpName });
			}
		},
		{
			accessorKey: 'ioc_description',
			header: () => 'Description',
			cell: (cell) => cell.getValue() || '-'
		},
		{
			accessorKey: 'ioc_tags',
			header: () => 'Tags',
			cell: (cell) => cell.getValue() || '-'
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
			{columns}
			data={iocs}
			page={(tablePage ?? $page.data.iocs?.current_page) || 1}
			{totalPages}
			on:pageChange={(e) => dispatch('pageChange', e.detail)}
		></DataTable>
		<!-- Note: Pagination might need to be handled by passing total/last_page from store/API response -->
	{/if}
</div>

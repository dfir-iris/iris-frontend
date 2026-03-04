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

	import { page } from '$app/stores';

	// Re-dispatch events so parent layouts can react
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();

	const columns: ColumnDef<Asset>[] = [
		{
			accessorKey: 'asset_name',
			header: () => 'Name',
			cell: (cell) =>
				renderComponent(LinkCell, {
					href: `/case/${caseId}/assets/${cell.row.original.asset_id}`,
					label: `${cell.getValue()}`
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

<div class="{className} flex overflow-auto rounded border bg-card pt-1">
	{#if !assets || assets.length === 0}
		<div class="w-full p-4 text-center">
			<p>No assets to display.</p>
		</div>
	{:else}
		<DataTable
			{columns}
			data={assets}
			page={(tablePage ?? $page.data.assets?.current_page) || 1}
			{totalPages}
			on:pageChange={(e) => dispatch('pageChange', e.detail)}
		></DataTable>
	{/if}
</div>

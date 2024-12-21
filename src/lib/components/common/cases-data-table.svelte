<script lang="ts">
	import type { RequestResponse } from '$lib/services/api.service';
	import type { Case } from '$lib/types/resources/case';
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import DataTable from '../ui/data-table-tanstack/data-table.svelte';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import StatusBadge from '../ui/badge/status-badge.svelte';
	import SeverityBadge from '../ui/badge/severity-badge.svelte';
	import { LinkCell } from '../ui/table';

	let {
		cases,
		class: className = ''
	}: {
		cases: Promise<RequestResponse<Case[]>> | RequestResponse<Case[]>;
		class?: string;
	} = $props();

	// Columns configuration
	const columns: ColumnDef<Case>[] = [
		{
			accessorKey: 'name',
			header: () => 'Title',
			cell: (cell) => {
				console.log(cell.row.original);
				return renderComponent(LinkCell, {
					href: `/case/${cell.row.original.case_id}`,
					label: `${cell.getValue()}`
				});
			}
		},
		{
			accessorKey: 'open_date',
			header: () => 'Open Date',
			cell: (cell) => {
				const asDate = new Date(`${cell.getValue()}`);
				return mediumDateTimeFormatter(asDate);
			}
		},
		{
			accessorKey: 'client.customer_name',
			header: 'Client'
		},
		{
			accessorKey: 'state.state_name',
			header: 'State',
			cell: (cell) => {
				return renderComponent(StatusBadge, { status: `${cell.getValue() || 'Unknown'}` });
			}
		},
		{
			accessorKey: 'severity.severity_name',
			header: 'Severity',
			cell: (cell) => {
				return renderComponent(SeverityBadge, { severity: `${cell.getValue() || 'Unknown'}` });
			}
		}
	];
</script>

<DataTable {columns} data={cases} page={1}></DataTable>

<script lang="ts">
	import type { Paginated, RequestResponse } from '$lib/services/api.service';
	import type { Case } from '$lib/types/resources/case';
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import DataTable from '../ui/data-table-tanstack/data-table.svelte';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import StatusBadge from '../ui/badge/status-badge.svelte';
	import SeverityBadge from '../ui/badge/severity-badge.svelte';
	import { LinkCell } from '../ui/table';
	import Skeleton from '../ui/skeleton/skeleton.svelte';

	let {
		cases,
		class: className = ''
	}: {
		cases: Promise<RequestResponse<Paginated<Case>>>;
		class?: string;
	} = $props();

	// Columns configuration
	const columns: ColumnDef<Case>[] = [
		{
			accessorKey: 'case_name',
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
			accessorKey: 'case_customer.customer_name',
			header: 'Client'
		},
		{
			accessorKey: 'state.state_name',
			header: 'State',
			cell: (cell) => {
				const status = (cell.getValue() || 'Unknown') as
					| 'Pending'
					| 'In progress'
					| 'Completed'
					| 'Unspecified'
					| 'To do'
					| 'Closed'
					| 'Merged'
					| 'Assigned'
					| 'New'; // should make this a const?
				return renderComponent(StatusBadge, { status: status });
			}
		},
		{
			accessorKey: 'severity.severity_name',
			header: 'Severity',
			cell: (cell) => {
				const severity = (cell.getValue() || 'Unknown') as
					| 'Unspecified'
					| 'Low'
					| 'Medium'
					| 'High'
					| 'Critical';
				return renderComponent(SeverityBadge, { severity: severity });
			}
		}
	];
</script>

<div class="{className} flex overflow-hidden rounded border bg-card pt-1">
	{#await cases}
		<!-- Loading state -->
		<div class="space-y-2 overflow-clip p-4">
			<div class="grid grid-cols-5 gap-4 border-b">
				<Skeleton class="h-6" />
				<Skeleton class="h-6" />
				<Skeleton class="h-6" />
				<Skeleton class="h-6" />
				<Skeleton class="h-6" />
			</div>
			{#each Array(10) as _}
				<div class="grid grid-cols-5 gap-4">
					<Skeleton class="h-8" />
					<Skeleton class="h-8" />
					<Skeleton class="h-8" />
					<Skeleton class="h-8" />
					<Skeleton class="h-8" />
				</div>
			{/each}
		</div>
	{:then { data }}
		<DataTable {columns} data={data.data} page={data.current_page}></DataTable>
	{/await}
</div>

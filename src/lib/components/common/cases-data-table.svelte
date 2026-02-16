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
		class: className = '',
		page = $bindable(),
		onPageChange,
		pageSize = 10
	}: {
		cases: Promise<RequestResponse<Paginated<Case>>>;
		class?: string;
		page?: number;
		onPageChange?: (page: number) => void;
		pageSize?: number;
	} = $props();

	if (page === undefined) page = 1;

	let loading = $state(true);
	let res = $state<RequestResponse<Paginated<Case>> | null>(null);

	let suppressEmit = false;
	let lastEmitted = page;

	const syncFromServer = (p: number) => {
		suppressEmit = true;
		page = p;
		lastEmitted = p;

		queueMicrotask(() => (suppressEmit = false));
	};

	$effect(() => {
		if (suppressEmit) return;
		if (page === lastEmitted) return;

		lastEmitted = page as number;
		onPageChange?.(page as number);
	});

	$effect(() => {
		let cancelled = false;

		loading = true;
		res = null;

		(async () => {
			const out = await cases;
			if (cancelled) return;

			res = out;
			loading = false;

			syncFromServer((out?.data as Paginated<Case>).current_page);
		})();

		return () => (cancelled = true);
	});

	const columns: ColumnDef<Case>[] = [
		{
			accessorKey: 'case_name',
			header: () => 'Title',
			cell: (cell) =>
				renderComponent(LinkCell, {
					href: `/case/${cell.row.original.case_id}`,
					label: `${cell.getValue()}`
				})
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

<div class="{className} flex overflow-hidden bg-card">
	{#if loading}
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
	{:else}
		<DataTable
			columns={columns as unknown as ColumnDef<unknown>[]}
			data={(res?.data as Paginated<Case>).data}
			bind:page
			{pageSize}
			totalPages={(res?.data as Paginated<Case>).last_page as number}
		/>
	{/if}
</div>

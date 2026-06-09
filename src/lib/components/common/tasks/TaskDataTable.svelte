<script lang="ts">
	import type { Task } from '$lib/types/resources/task';
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import { LinkCell } from '$lib/components/ui/table';
	import { page } from '$app/stores';
	import { createEventDispatcher } from 'svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import type { CaseStatus } from '$lib/components/ui/badge/types';

	export let tasks: Task[];
	export let caseId: string | number | null = null;
	export let className: string = '';
	export let totalPages: number | null = null;
	export let tablePage: number | null = null;
	export let perPage: number = 10;

	const dispatch = createEventDispatcher();

	let currentPage: number = (tablePage ?? $page.data.tasks?.current_page) || 1;
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

	const columns: ColumnDef<Task>[] = [
		{
			accessorKey: 'task_title',
			header: () => 'Title',
			...(caseId != null && {
				cell: (cell) =>
					renderComponent(LinkCell, {
						href: `/case/${caseId}/tasks/${cell.row.original.id}`,
						label: `${cell.getValue()}`
					})
			})
		},
		{
			accessorKey: 'status.status_name',
			header: () => 'Status',
			cell: (cell) => {
				const status = cell.getValue() as string;
				return status
					? renderComponent(StatusBadge, { status: status as CaseStatus })
					: '-';
			}
		},
		{
			accessorKey: 'task_open_date',
			header: () => 'Opened'
		},
		{
			accessorKey: 'task_assignees',
			header: () => 'Assignees',
			cell: (cell) => {
				const assignees = cell.getValue() as Task['task_assignees'];
				return assignees?.map((a) => a.name || a.user).join(', ') || '-';
			}
		},
		{
			accessorKey: 'task_tags',
			header: () => 'Tags',
			cell: (cell) => cell.getValue() || '-'
		}
	];
</script>

<div class="{className} flex overflow-auto">
	{#if !tasks || tasks.length === 0}
		<div class="w-full p-4 text-center">
			<p>No tasks to display.</p>
		</div>
	{:else}
		<DataTable
			{columns}
			data={tasks}
			bind:page={currentPage}
			bind:pageSize={currentPageSize}
			totalPages={totalPages ?? undefined}
		></DataTable>
	{/if}
</div>

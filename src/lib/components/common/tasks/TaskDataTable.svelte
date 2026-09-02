<script lang="ts">
	import type { Task } from '$lib/types/resources/task';
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import { LinkCell } from '$lib/components/ui/table';
	import { page } from '$app/stores';
	import { createEventDispatcher } from 'svelte';
	import StatusBadge from '$lib/components/ui/badge/status-badge.svelte';
	import type { CaseStatus } from '$lib/components/ui/badge/types';
	import AssigneesCell from './AssigneesCell.svelte';
	import RowCheckbox from '$lib/components/common/RowCheckbox.svelte';

	export let tasks: Task[];
	export let caseId: string | number | null = null;
	export let className: string = '';
	export let totalPages: number | null = null;
	export let tablePage: number | null = null;
	export let perPage: number = 10;
	export let selectionMode: boolean = false;
	export let selectedTasks: Set<number> = new Set();
	export let onToggleSelect: ((id: number) => void) | undefined = undefined;

	const dispatch = createEventDispatcher();

	// See AssetDataTable for the rationale on this two-step sync — it avoids
	// the race where the parent's lagging tablePage snaps back the user's
	// click before the server response arrives.
	let currentPage: number = (tablePage ?? $page.data.tasks?.current_page) || 1;
	let lastTablePage: number | null = tablePage ?? null;
	$: if (tablePage != null && tablePage !== lastTablePage && tablePage !== currentPage) {
		currentPage = tablePage;
		lastTablePage = tablePage;
	} else if (tablePage != null && tablePage !== lastTablePage) {
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

	const dataColumns: ColumnDef<Task>[] = [
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
				return status ? renderComponent(StatusBadge, { status: status as CaseStatus }) : '-';
			}
		},
		{
			accessorKey: 'task_open_date',
			header: () => 'Opened'
		},
		{
			accessorKey: 'task_assignees',
			header: () => 'Assignees',
			cell: (cell) =>
				renderComponent(AssigneesCell, {
					assignees: cell.getValue() as Task['task_assignees']
				})
		},
		{
			accessorKey: 'task_tags',
			header: () => 'Tags',
			cell: (cell) => cell.getValue() || '-'
		}
	];

	$: columns = selectionMode
		? [
				{
					id: '__select__',
					header: () => '',
					meta: { thClass: 'w-8 pr-0', tdClass: 'w-8 pr-0' },
					cell: (cell: import('@tanstack/svelte-table').CellContext<Task, unknown>) =>
						renderComponent(RowCheckbox, {
							checked: selectedTasks.has(cell.row.original.id),
							onToggle: () => onToggleSelect?.(cell.row.original.id)
						})
				} as ColumnDef<Task>,
				...dataColumns
			]
		: dataColumns;
</script>

<div class="{className} flex overflow-auto">
	{#if !tasks || tasks.length === 0}
		<div class="w-full p-4 text-center">
			<p>No tasks to display.</p>
		</div>
	{:else}
		<DataTable
			columns={columns as import('@tanstack/svelte-table').ColumnDef<unknown>[]}
			data={tasks}
			bind:page={currentPage}
			bind:pageSize={currentPageSize}
			totalPages={totalPages ?? undefined}
		></DataTable>
	{/if}
</div>

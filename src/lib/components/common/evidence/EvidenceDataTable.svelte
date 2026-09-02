<script lang="ts">
	import type { Evidence } from '$lib/types/resources/evidence';
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import { LinkCell } from '$lib/components/ui/table';
	import { createEventDispatcher } from 'svelte';
	import RowCheckbox from '$lib/components/common/RowCheckbox.svelte';

	export let evidences: Evidence[];
	export let caseId: string | number | null = null;
	export let className: string = '';
	export let totalPages: number | null = null;
	export let tablePage: number | null = null;
	export let perPage: number = 10;
	export let selectionMode: boolean = false;
	export let selectedEvidences: Set<number> = new Set();
	export let onToggleSelect: ((id: number) => void) | undefined = undefined;

	const dispatch = createEventDispatcher();

	// See TaskDataTable for the rationale on this two-step sync — it avoids
	// the race where the parent's lagging tablePage snaps back the user's
	// click before the server response arrives.
	let currentPage: number = tablePage ?? 1;
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

	const formatSize = (bytes: number | null): string => {
		if (!bytes || bytes <= 0) return '-';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
		const value = bytes / Math.pow(1024, i);
		return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
	};

	const dataColumns: ColumnDef<Evidence>[] = [
		{
			accessorKey: 'filename',
			header: () => 'Filename',
			...(caseId != null && {
				cell: (cell) =>
					renderComponent(LinkCell, {
						href: `/case/${caseId}/evidence/${cell.row.original.id}`,
						label: `${cell.getValue()}`
					})
			})
		},
		{
			accessorKey: 'type.name',
			header: () => 'Type',
			cell: (cell) => (cell.getValue() as string) || '-'
		},
		{
			accessorKey: 'file_size',
			header: () => 'Size',
			cell: (cell) => formatSize(cell.getValue() as number | null)
		},
		{
			accessorKey: 'file_hash',
			header: () => 'Hash',
			cell: (cell) => (cell.getValue() as string) || '-'
		},
		{
			accessorKey: 'date_added',
			header: () => 'Added'
		},
		{
			accessorKey: 'user.user_name',
			header: () => 'Added by',
			cell: (cell) => (cell.getValue() as string) || '-'
		}
	];

	$: columns = selectionMode
		? [
				{
					id: '__select__',
					header: () => '',
					meta: { thClass: 'w-8 pr-0', tdClass: 'w-8 pr-0' },
					cell: (cell: import('@tanstack/svelte-table').CellContext<Evidence, unknown>) =>
						renderComponent(RowCheckbox, {
							checked: selectedEvidences.has(cell.row.original.id),
							onToggle: () => onToggleSelect?.(cell.row.original.id)
						})
				} as ColumnDef<Evidence>,
				...dataColumns
			]
		: dataColumns;
</script>

<div class="{className} flex overflow-auto">
	{#if !evidences || evidences.length === 0}
		<div class="w-full p-4 text-center">
			<p>No evidence to display.</p>
		</div>
	{:else}
		<DataTable
			columns={columns as import('@tanstack/svelte-table').ColumnDef<unknown>[]}
			data={evidences}
			bind:page={currentPage}
			bind:pageSize={currentPageSize}
			totalPages={totalPages ?? undefined}
		></DataTable>
	{/if}
</div>

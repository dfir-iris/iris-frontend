<!--
  Cases overview table. A column-rich row per case (Title / SOC / Open
  / Closed / Customer / State / Severity / Owner / Tags) so triage can
  happen without clicking into each case. Clicking the title opens the
  CaseDetailModal which shows the full metadata and the formatted
  summary, with a CTA to jump into the full case page when needed —
  matches the old jQuery UI's quick-peek behaviour.
-->
<script lang="ts">
	import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
	import type { Paginated, RequestResponse } from '$lib/services/api.service';
	import type { Case, Tags } from '$lib/types/resources/case';
	import DataTable from '../ui/data-table-tanstack/data-table.svelte';
	import { mediumDateTimeFormatter } from '$lib/utils/time-formatter';
	import StatusBadge from '../ui/badge/status-badge.svelte';
	import SeverityBadge from '../ui/badge/severity-badge.svelte';
	import CaseTitleCell from './CaseTitleCell.svelte';
	import CaseTagsCell from './CaseTagsCell.svelte';
	import CaseDetailModal from './CaseDetailModal.svelte';
	import Skeleton from '../ui/skeleton/skeleton.svelte';

	type SortState = { id: string; dir: 'asc' | 'desc' | null } | null;

	let {
		cases,
		class: className = '',
		page = $bindable(),
		onPageChange,
		pageSize = 10,
		sort,
		onSortChange
	}: {
		cases: Promise<RequestResponse<Paginated<Case>>>;
		class?: string;
		page?: number;
		onPageChange?: (page: number) => void;
		pageSize?: number;
		sort?: SortState;
		onSortChange?: (next: SortState) => void;
	} = $props();

	if (page === undefined) page = 1;

	let loading = $state(true);
	let res = $state<RequestResponse<Paginated<Case>> | null>(null);

	let suppressEmit = false;
	let lastEmitted = page;

	// Title-click modal state. We seed the modal with the row already in
	// the table so the metadata strip can render immediately while the
	// full row finishes loading from the get-by-id endpoint.
	let modalOpen = $state(false);
	let modalCaseId = $state<number | null>(null);
	let modalSeed = $state<Case | null>(null);

	const openModal = (c: Case) => {
		modalCaseId = c.case_id;
		modalSeed = c;
		modalOpen = true;
	};

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

	const fmtDate = (raw: string | null | undefined): string => {
		if (!raw) return '—';
		const d = new Date(raw);
		if (Number.isNaN(d.getTime())) return String(raw);
		return mediumDateTimeFormatter(d);
	};

	const columns: ColumnDef<Case>[] = [
		{
			accessorKey: 'case_name',
			header: () => 'Title',
			cell: (cell) =>
				renderComponent(CaseTitleCell, {
					row: cell.row.original,
					onOpen: openModal
				})
		},
		{
			accessorKey: 'case_soc_id',
			header: () => 'SOC ID',
			cell: (cell) => String(cell.getValue() ?? '—')
		},
		{
			accessorKey: 'open_date',
			header: () => 'Opened',
			cell: (cell) => fmtDate(cell.getValue() as string | null)
		},
		{
			accessorKey: 'close_date',
			header: () => 'Closed',
			cell: (cell) => {
				const raw = cell.getValue() as string | null;
				return raw ? fmtDate(raw) : '—';
			}
		},
		{
			accessorKey: 'case_customer.customer_name',
			header: () => 'Customer',
			cell: (cell) => String(cell.getValue() ?? '—')
		},
		{
			accessorKey: 'state.state_name',
			header: () => 'State',
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
					| 'New';
				return renderComponent(StatusBadge, { status });
			}
		},
		{
			accessorKey: 'severity.severity_name',
			header: () => 'Severity',
			cell: (cell) => {
				const severity = (cell.getValue() || 'Unspecified') as
					| 'Unspecified'
					| 'Low'
					| 'Medium'
					| 'High'
					| 'Critical';
				return renderComponent(SeverityBadge, { severity });
			}
		},
		{
			accessorKey: 'owner.user_login',
			header: () => 'Owner',
			cell: (cell) => {
				const row = cell.row.original as Case;
				return row.owner?.user_name ?? row.owner?.user_login ?? '—';
			}
		},
		{
			accessorKey: 'tags',
			header: () => 'Tags',
			cell: (cell) =>
				renderComponent(CaseTagsCell, {
					tags: (cell.getValue() as Tags[] | undefined) ?? []
				})
		}
	];
</script>

<!--
  Side-scroll container: the table grows wider than the viewport
  (nine information-dense columns), so we lock the horizontal scroll
  to this card instead of letting it push the page sideways.
  `min-w-0` is critical inside the flex parent so the column can
  shrink below the table's intrinsic width and `overflow-x-auto`
  actually engages.
-->
<div
	class="{className} flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-border/60 bg-card shadow-sm"
>
	{#if loading}
		<div class="space-y-2 overflow-clip p-4">
			<div class="grid grid-cols-9 gap-4 border-b pb-2">
				{#each Array(9) as _}
					<Skeleton class="h-6" />
				{/each}
			</div>
			{#each Array(10) as _}
				<div class="grid grid-cols-9 gap-4">
					{#each Array(9) as _}
						<Skeleton class="h-8" />
					{/each}
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
			tableClass="w-max min-w-full table-auto text-sm"
			showColumnFilters={false}
			{sort}
			{onSortChange}
			class="flex-1"
		/>
	{/if}
</div>

<CaseDetailModal bind:open={modalOpen} caseId={modalCaseId} seed={modalSeed} />

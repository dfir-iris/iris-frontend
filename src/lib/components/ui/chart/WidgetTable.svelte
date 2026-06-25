<!--
  Backend-shaped widget table → tanstack data-table.

  The backend `format_widget_payload` returns a row-of-cells shape that's
  optimized for jQuery rendering (each row has `formatted_group_values`
  and `value_cells: [{formatted_value, formatted_percentage}]`). Tanstack
  wants flat records keyed by column id, so we flatten here once and let
  the data-table take care of paging, sorting and per-column filtering.
-->
<script lang="ts">
	import type { ColumnDef } from '@tanstack/svelte-table';
	import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
	import type { RenderedTableRow, RenderedTableCell } from '$lib/services/custom-dashboards.service';

	type Props = {
		groupHeaders?: string[];
		valueHeaders?: string[];
		groupKeys?: string[];
		valueKeys?: string[];
		rows?: RenderedTableRow[] | Array<Record<string, unknown>>;
		totals?: RenderedTableCell[];
		totalLabel?: string;
	};

	let {
		groupHeaders = [],
		valueHeaders = [],
		groupKeys = [],
		valueKeys = [],
		rows = [],
		totals = [],
		totalLabel = 'Total'
	}: Props = $props();

	type FlatRow = Record<string, { display: string; numeric: number | null; raw: unknown; percentage: string }>;

	const data = $derived.by<FlatRow[]>(() => {
		return (rows as RenderedTableRow[]).map((row) => {
			const flat: FlatRow = {};
			const groupValues = row.formatted_group_values ?? [];
			groupKeys.forEach((key, idx) => {
				const display = String(groupValues[idx] ?? '');
				flat[key] = { display, numeric: null, raw: row.group_values?.[idx], percentage: '' };
			});
			const valueCells = row.value_cells ?? [];
			valueKeys.forEach((key, idx) => {
				const cell = valueCells[idx];
				const numeric = typeof cell?.value === 'number' ? cell.value : Number(cell?.value);
				flat[key] = {
					display: cell?.formatted_value ?? '',
					numeric: Number.isFinite(numeric) ? numeric : null,
					raw: cell?.value,
					percentage: cell?.formatted_percentage && cell.formatted_percentage !== '--' ? cell.formatted_percentage : ''
				};
			});
			return flat;
		});
	});

	const columns = $derived.by<ColumnDef<FlatRow>[]>(() => {
		const cols: ColumnDef<FlatRow>[] = [];
		groupKeys.forEach((key, idx) => {
			cols.push({
				id: key,
				accessorFn: (row) => row[key]?.display ?? '',
				header: groupHeaders[idx] ?? key,
				cell: ({ getValue }) => String(getValue() ?? '')
			});
		});
		valueKeys.forEach((key, idx) => {
			cols.push({
				id: key,
				// Sort numerically when possible, but render the formatted display
				// (which carries comma-separators / unit suffixes from the backend).
				accessorFn: (row) => row[key]?.numeric ?? row[key]?.display ?? '',
				header: valueHeaders[idx] ?? key,
				cell: ({ row }) => {
					const cell = row.original[key];
					if (!cell) return '';
					return cell.percentage ? `${cell.display} (${cell.percentage})` : cell.display;
				}
			});
		});
		return cols;
	});

	const showTotals = $derived(totals.length > 0 && rows.length > 0);
</script>

<div class="flex flex-col gap-2">
	<DataTable {data} {columns} tableClass="w-full table-auto text-xs" />
	{#if showTotals}
		<div class="flex flex-wrap justify-end gap-3 border-t pt-2 text-xs">
			<span class="font-medium text-muted-foreground">{totalLabel}</span>
			{#each totals as total, idx (idx)}
				<span class="tabular-nums">
					<span class="text-muted-foreground">{valueHeaders[idx] ?? total.key}:</span>
					<span class="font-medium">{total.formatted_value}</span>
				</span>
			{/each}
		</div>
	{/if}
</div>

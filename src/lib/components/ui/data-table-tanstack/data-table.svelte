<script lang="ts">
	import { type Component } from 'svelte';
	import type { ColumnDef } from '@tanstack/svelte-table';
	import {
		ArrowDownIcon,
		ArrowUpDownIcon,
		ArrowUpIcon,
		ChevronLeftIcon,
		ChevronRightIcon,
		FilterIcon,
		XIcon
	} from 'lucide-svelte';

	type SortDir = 'asc' | 'desc' | null;
	type SortState = { id: string; dir: SortDir } | null;

	type Props<T> = {
		data: T[];
		columns: ColumnDef<T>[];
		class?: string;
		tableClass?: string;
		page?: number;
		pageSize?: number;
		totalPages?: number;
		pageSizeOptions?: number[];
		/**
		 * Controlled sort state. When provided the table delegates the
		 * sort decision to the caller — it stops doing its own in-memory
		 * sort and just emits `onSortChange` when the user clicks a
		 * column header. Required for server-side ordering since the
		 * server already returns rows in the right order.
		 */
		sort?: SortState;
		onSortChange?: (next: SortState) => void;
		/**
		 * Hides the built-in per-column popover filter. Use this when
		 * the page provides its own filter UI (the cases overview now
		 * does) so the header doesn't surface two competing filter
		 * affordances on the same column.
		 */
		showColumnFilters?: boolean;
	};

	let {
		data,
		columns,
		class: className = '',
		tableClass = 'w-full table-auto text-sm',
		page = $bindable(),
		pageSize = $bindable(10),
		totalPages: totalPagesProp,
		pageSizeOptions = [10, 20, 25, 50, 100],
		sort: sortProp,
		onSortChange,
		showColumnFilters = true
	}: Props<unknown> = $props();

	const isControlledSort = $derived(sortProp !== undefined);

	if (page === undefined) page = 1;

	let internalSort = $state<SortState>(null);
	const sort = $derived<SortState>(isControlledSort ? (sortProp as SortState) : internalSort);
	let filters = $state<Record<string, string>>({});
	let filterColumn = $state<string | null>(null);

	const columnKey = <T,>(column: ColumnDef<T>) => {
		const id = (column as { id?: unknown }).id;
		if (typeof id === 'string' && id) return id;

		const accessorKey = (column as { accessorKey?: unknown }).accessorKey;
		if (typeof accessorKey === 'string' && accessorKey) return accessorKey;
	};

	const columnHeader = <T,>(column: ColumnDef<T>, key: string): string => {
		const header = (column as { header?: unknown }).header;

		if (typeof header === 'string') return header;

		if (typeof header === 'function') return (header as () => unknown)() as string;

		return key;
	};

	const valueByPath = (obj: unknown, path: string) => {
		const parts = path.split('.').filter(Boolean);

		let current: unknown = obj;

		for (const p of parts) {
			if (current == null || typeof current !== 'object') return undefined;

			current = (current as Record<string, unknown>)[p];
		}

		return current;
	};

	const columnValue = <T,>(c: ColumnDef<T>, row: T) => {
		const accessorFn = (c as { accessorFn?: unknown }).accessorFn;
		if (typeof accessorFn === 'function') return accessorFn(row);

		const accessorKey = (c as { accessorKey?: unknown }).accessorKey;
		if (typeof accessorKey === 'string' && accessorKey) return valueByPath(row, accessorKey);

		return null;
	};

	const columnCell = <T,>(c: ColumnDef<T>, row: T, getValue: () => unknown) => {
		const cell = (c as { cell?: unknown }).cell;

		if (typeof cell !== 'function') return getValue();

		const out = cell({ row: { original: row }, getValue });

		if (typeof out === 'function') return out as (...args: unknown[]) => unknown;

		return String(out);
	};

	const cols = $derived.by(() =>
		(columns as ColumnDef<unknown>[]).map((c) => {
			const key = columnKey(c);

			return { c, key, header: columnHeader(c, key as string) };
		})
	);

	const matches = (value: string | number | null, q: string): boolean => {
		if (!q) return true;
		return String(value ?? '')
			.toLowerCase()
			.includes(q.toLowerCase());
	};

	const filtered = $derived.by(() => {
		const unfiltered = data as unknown[];

		return unfiltered.length
			? unfiltered.filter((row) => {
					for (const col of cols) {
						const query = filters[col.key as string] ?? '';

						if (!query) continue;

						if (!matches(columnValue(col.c, row), query)) return false;
					}

					return true;
				})
			: [];
	});

	const sorted = $derived.by(() => {
		// Controlled mode: the caller already sorted server-side, do
		// not re-sort here or the local pass would fight the server.
		if (isControlledSort) return filtered.slice();

		if (!sort?.dir) return filtered.slice();

		const col = cols.find((x) => x.key === sort?.id);
		if (!col) return filtered.slice();

		const dir = sort.dir === 'asc' ? 1 : -1;

		return filtered.slice().sort((a, b) => {
			const av = columnValue(col.c, a);
			const bv = columnValue(col.c, b);

			if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;

			return String(av ?? '').localeCompare(String(bv ?? '')) * dir;
		});
	});

	const totalPages = $derived.by(() => {
		const computed = Math.max(1, Math.ceil(sorted.length / Math.max(1, pageSize)));

		if (
			typeof totalPagesProp === 'number' &&
			Number.isFinite(totalPagesProp) &&
			totalPagesProp >= 1
		) {
			return Math.max(1, Math.floor(totalPagesProp));
		}

		return computed;
	});

	const clampedPage = $derived.by(() => Math.min(Math.max(1, page ?? 1), totalPages));

	$effect(() => {
		if (page !== clampedPage) page = clampedPage;
	});

	const paged = $derived.by(() => {
		if (
			typeof totalPagesProp === 'number' &&
			Number.isFinite(totalPagesProp) &&
			totalPagesProp >= 1
		) {
			return sorted;
		}

		const ps = Math.max(1, pageSize);
		const start = (clampedPage - 1) * ps;
		return sorted.slice(start, start + ps);
	});

	const toggleSort = (id: string) => {
		const current = sort;
		const next: SortState =
			!current || current.id !== id
				? { id, dir: 'asc' }
				: current.dir === 'asc'
					? { id, dir: 'desc' }
					: null;

		if (isControlledSort) {
			onSortChange?.(next);
		} else {
			internalSort = next;
		}
	};

	const toggleFilter = (id: string) => (filterColumn = filterColumn === id ? null : id);

	const setFilter = (id: string, v: string) => {
		filters = { ...filters, [id]: v };
		page = 1;
	};

	const clearFilter = (id: string) => {
		const next = { ...filters };
		delete next[id];
		filters = next;
		if (filterColumn === id) filterColumn = null;
		page = 1;
	};
</script>

<div class={`flex w-full min-h-0 min-w-0 flex-col ${className}`}>
	<!--
	  Inner scroll wrapper. `flex-1 min-h-0` lets it consume the
	  height the caller granted us (typically via a `flex-1 min-h-0`
	  parent), and `overflow-auto` engages both vertical *and*
	  horizontal scroll inside this box rather than on the page.
	-->
	<div class="min-h-0 min-w-0 flex-1 overflow-auto">
	<table class={tableClass}>
		<thead>
			<tr class="border-b border-border/50">
				{#each cols as col (col.key)}
					{@const colMeta = (col.c as { meta?: { thClass?: string; tdClass?: string } }).meta}
					<th class="px-3 py-2 text-left align-top font-medium text-muted-foreground {colMeta?.thClass ?? ''}">
						<div class="flex w-full items-center justify-between gap-2">
							<span class="min-w-0 truncate">{col.header}</span>

							<div class="flex shrink-0 items-center gap-0.5 opacity-40 transition-opacity hover:opacity-100">
								{#if showColumnFilters}
									<button
										type="button"
										class="shrink-0 rounded p-0.5 hover:bg-muted"
										aria-label={`Filter ${col.header}`}
										onclick={() => toggleFilter(col.key as string)}
									>
										<FilterIcon class="size-3" />
									</button>
								{/if}

								<button
									type="button"
									class="shrink-0 rounded p-0.5 hover:bg-muted"
									aria-label={`Sort ${col.header}`}
									onclick={() => toggleSort(col.key as string)}
								>
									{#if sort?.id === col.key && sort?.dir === 'asc'}
										<ArrowUpIcon class="size-3" />
									{:else if sort?.id === col.key && sort?.dir === 'desc'}
										<ArrowDownIcon class="size-3" />
									{:else}
										<ArrowUpDownIcon class="size-3" />
									{/if}
								</button>
							</div>
						</div>

						{#if showColumnFilters && filterColumn === col.key}
							<div class="mt-1.5 flex min-w-0 items-center gap-1.5">
								<input
									class="h-7 w-full min-w-0 rounded-md border border-border/50 bg-background px-2 text-xs focus:border-ring focus:outline-none"
									placeholder="Filter…"
									value={filters[col.key] ?? ''}
									oninput={(e) =>
										setFilter(col.key as string, (e.currentTarget as HTMLInputElement).value)}
								/>

								<button
									class="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
									aria-label={`Clear filter ${col.header}`}
									onclick={() => clearFilter(col.key as string)}
								>
									<XIcon class="size-3" />
								</button>
							</div>
						{/if}
					</th>
				{/each}
			</tr>
		</thead>

		<tbody>
			{#if paged.length === 0}
				<tr>
					<td class="px-3 py-4 text-center text-muted-foreground" colspan={cols.length}>No results</td>
				</tr>
			{:else}
				{#each paged as row, i (i)}
					<tr class="border-b border-border/30 transition-colors last:border-b-0 hover:bg-muted/40">
						{#each cols as col (col.key)}
							{@const v = columnCell(col.c, row, () => columnValue(col.c, row))}
							{@const colMeta = (col.c as { meta?: { thClass?: string; tdClass?: string } }).meta}

							<td class="px-3 py-2 {colMeta?.tdClass ?? ''}">
								{#if typeof v === 'function'}
									{@const Comp = v as Component}
									<Comp />
								{:else}
									{v}
								{/if}
							</td>
						{/each}
					</tr>
				{/each}
			{/if}
		</tbody>
	</table>
	</div>

	<div class="mt-2 flex shrink-0 items-center justify-end gap-3 pt-1">
		<label class="flex items-center gap-1.5 text-xs text-muted-foreground">
			<span>Rows</span>
			<select
				class="h-7 rounded-md border border-border/50 bg-background px-1.5 text-xs focus:border-ring focus:outline-none"
				value={pageSize}
				onchange={(e) => {
					const next = Number((e.currentTarget as HTMLSelectElement).value);
					if (Number.isFinite(next) && next > 0) {
						pageSize = next;
						page = 1;
					}
				}}
			>
				{#each pageSizeOptions as opt (opt)}
					<option value={opt}>{opt}</option>
				{/each}
			</select>
		</label>

		<div class="flex items-center gap-1.5">
			<button
				class="rounded-md border border-border/50 p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
				disabled={clampedPage <= 1}
				onclick={() => (page = clampedPage - 1)}
			>
				<ChevronLeftIcon class="size-3.5" />
			</button>

			<span class="px-1 text-xs text-muted-foreground">{clampedPage} / {totalPages}</span>

			<button
				class="rounded-md border border-border/50 p-1 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
				disabled={clampedPage >= totalPages}
				onclick={() => (page = clampedPage + 1)}
			>
				<ChevronRightIcon class="size-3.5" />
			</button>
		</div>
	</div>
</div>

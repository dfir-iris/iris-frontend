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
		page?: number;
		pageSize?: number;
		totalPages?: number;
	};

	let {
		data,
		columns,
		class: className = '',
		page = $bindable(),
		pageSize = 10,
		totalPages: totalPagesProp
	}: Props<unknown> = $props();

	if (page === undefined) page = 1;

	let sort = $state<SortState>(null);
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
		return (data as unknown[]).filter((row) => {
			for (const col of cols) {
				const query = filters[col.key as string] ?? '';

				if (!query) continue;

				if (!matches(columnValue(col.c, row), query)) return false;
			}

			return true;
		});
	});

	const sorted = $derived.by(() => {
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
		if (!sort || sort.id !== id) {
			sort = { id, dir: 'asc' };
			return;
		}

		sort = sort.dir === 'asc' ? { id, dir: 'desc' } : null;
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

<div class={`w-full overflow-auto ${className}`}>
	<table class="w-full table-fixed rounded-lg border">
		<thead>
			<tr class="border-b">
				{#each cols as col (col.key)}
					<th class="px-3 py-2 align-top">
						<div class="flex w-full items-center justify-between gap-2">
							<span class="min-w-0 truncate font-medium">{col.header}</span>

							<div class="flex shrink-0 items-center gap-1">
								<button
									type="button"
									class="shrink-0"
									aria-label={`Filter ${col.header}`}
									onclick={() => toggleFilter(col.key as string)}
								>
									<FilterIcon class="h-4 w-4" />
								</button>

								<button
									type="button"
									class="shrink-0"
									aria-label={`Sort ${col.header}`}
									onclick={() => toggleSort(col.key as string)}
								>
									{#if sort?.id === col.key && sort?.dir === 'asc'}
										<ArrowUpIcon class="h-4 w-4" />
									{:else if sort?.id === col.key && sort?.dir === 'desc'}
										<ArrowDownIcon class="h-4 w-4" />
									{:else}
										<ArrowUpDownIcon class="h-4 w-4" />
									{/if}
								</button>
							</div>
						</div>

						{#if filterColumn === col.key}
							<div class="mt-2 flex min-w-0 items-center gap-2">
								<input
									class="h-8 w-full min-w-0 rounded border px-2 text-sm"
									placeholder="Filter…"
									value={filters[col.key] ?? ''}
									oninput={(e) =>
										setFilter(col.key as string, (e.currentTarget as HTMLInputElement).value)}
								/>

								<button
									class="shrink-0"
									aria-label={`Clear filter ${col.header}`}
									onclick={() => clearFilter(col.key as string)}
								>
									<XIcon class="h-4 w-4" />
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
					<td class="px-3 py-6 text-center" colspan={cols.length}>No results</td>
				</tr>
			{:else}
				{#each paged as row, i (i)}
					<tr class="border-b last:border-b-0">
						{#each cols as col (col.key)}
							{@const v = columnCell(col.c, row, () => columnValue(col.c, row))}

							<td class="px-3 py-2">
								{#if typeof v === 'function'}
									<!-- <svelte:component this={v} /> -->
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

	<div class="mt-2 flex items-center justify-end gap-2">
		<button
			class="rounded border px-2 py-1"
			disabled={clampedPage <= 1}
			onclick={() => (page = clampedPage - 1)}
		>
			<ChevronLeftIcon class="h-4 w-4" />
		</button>

		<span class="text-sm">Page {clampedPage} / {totalPages}</span>

		<button
			class="rounded border px-2 py-1"
			disabled={clampedPage >= totalPages}
			onclick={() => (page = clampedPage + 1)}
		>
			<ChevronRightIcon class="h-4 w-4" />
		</button>
	</div>
</div>

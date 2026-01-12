<script lang="ts">
	import {
		createSvelteTable,
		flexRender,
		getCoreRowModel,
		type ColumnDef,
		type TableOptions
	} from '@tanstack/svelte-table';
	import { setContext, type Snippet, createEventDispatcher } from 'svelte';
	import { writable } from 'svelte/store';
	import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../table';
	import type { Paginated, RequestResponse } from '$lib/services/api.service';
	import { Button } from '../button';
	import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-svelte';

	// Component props
	interface Props<T> {
		data: T;
		columns: ColumnDef<T>[];
		class?: string;
		page?: number;
		totalPages?: number | null;
		maxPageButtons?: number;
	}

	const dispatch = createEventDispatcher();

	let { data, columns, class: className = '', page = $bindable(), totalPages = null, maxPageButtons = 7 }: Props<any> = $props();

	// Build a bounded page list with ellipses. Returns numbers and 'ellipsis' placeholders.
	function buildPageList(current: number, total: number, maxButtons: number) {
		const pages: Array<number | 'ellipsis'> = [];
		if (!total || total <= 1) return pages;

		if (total <= maxButtons) {
			for (let i = 1; i <= total; i++) pages.push(i);
			return pages;
		}

		const siblingCount = Math.max(1, Math.floor((maxButtons - 3) / 2));
		const left = Math.max(2, current - siblingCount);
		const right = Math.min(total - 1, current + siblingCount);

		pages.push(1);

		if (left > 2) pages.push('ellipsis');
		else for (let i = 2; i < left; i++) pages.push(i);

		for (let i = left; i <= right; i++) pages.push(i);

		if (right < total - 1) pages.push('ellipsis');
		else for (let i = right + 1; i < total; i++) pages.push(i);

		pages.push(total);
		return pages;
	}

	// Table configuration
	let options = writable<TableOptions<typeof data>>({
		getCoreRowModel: getCoreRowModel(),
		data: [],
		columns
	});

	const rerender = async (requestResponse: any[]) => {
		const response = await requestResponse;
		console.log(response);
		options.update((options) => ({
			...options,
			columns,
			data: response
		}));
	};

	// Rerender on data changes
	$effect(() => {
		rerender(data);
	});

	// Create table
	const table = createSvelteTable(options);

	// Make this table an accessible obj to children
	setContext('table', table);
</script>

<div class="{className} relative h-full w-full overflow-auto">
	<table class="w-full rounded-lg">
		<!-- Header -->
		<TableHeader>
			{#each $table.getHeaderGroups() as headerGroup}
				<TableRow>
					{#each headerGroup.headers as header}
						<TableHead class="border-b">
							{#if !header.isPlaceholder}
								{@const Cell = flexRender(header.column.columnDef.header, header.getContext())}
								<Cell />
							{/if}
						</TableHead>
					{/each}
				</TableRow>
			{/each}
		</TableHeader>

		<!-- Body -->
		<TableBody class="overflow-auto pb-2">
			{#each $table.getRowModel().rows as row}
				<TableRow>
					{#each row.getVisibleCells() as cell}
						<TableCell>
							{@const Cell = flexRender(cell.column.columnDef.cell, cell.getContext())}
							<Cell></Cell>
						</TableCell>
					{/each}
				</TableRow>
			{/each}
			<TableRow class="h-10"></TableRow>
		</TableBody>

		<!-- Footer -->
		<TableFooter class="absolute bottom-0 left-0 h-10 w-full">
			<TableRow class="inline-block h-full w-full ">
				<div
					class="flex w-full flex-row items-center justify-end gap-1 border-t text-foreground dark:text-foreground"
				>
					<!-- Show pagination if there is a page set -->
					{#if page}
						<Button
							disabled={page <= 1}
							onclick={() => dispatch('pageChange', { page: Math.max(1, page - 1) })}
							variant="ghost"><ChevronLeftIcon /></Button
						>
						{#if totalPages}
							<div class="flex items-center gap-1 px-2">
								{#each buildPageList(page || 1, totalPages, maxPageButtons) as p}
									{#if p === 'ellipsis'}
										<span class="px-2">…</span>
									{:else}
										<Button
											variant={p === page ? 'outline' : 'ghost'}
											onclick={() => dispatch('pageChange', { page: p })}
											class={p === page ? 'active' : ''}
										>{p}</Button>
									{/if}
								{/each}
							</div>
						{:else}
							<span class="text-base">Page {page}</span>
						{/if}

						<Button
							disabled={totalPages ? ((page || 1) >= totalPages) : false}
							onclick={() => dispatch('pageChange', { page: (page || 1) + 1 })}
							variant="ghost">
							<ChevronRightIcon />
						</Button>
					{/if}
				</div>
			</TableRow>
		</TableFooter>
		</table>
	</div>
<script lang="ts">
	import {
		createSvelteTable,
		flexRender,
		getCoreRowModel,
		type ColumnDef,
		type TableOptions
	} from '@tanstack/svelte-table';
	import { setContext, type Snippet } from 'svelte';
	import { writable } from 'svelte/store';
	import { TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '../table';
	import type { RequestResponse } from '$lib/services/api.service';
	import { Button } from '../button';
	import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-svelte';

	// Component props
	interface Props<T> {
		data: T;
		columns: ColumnDef<T>[];
		class?: string;
		page?: number;
	}

	let { data, columns, class: className = '', page = $bindable() }: Props<any> = $props();

	// Table configuration
	let options = writable<TableOptions<typeof data>>({
		getCoreRowModel: getCoreRowModel(),
		data: [],
		columns
	});

	const rerender = async (requestResponse: Promise<RequestResponse<any>>) => {
		const response = await requestResponse;
		options.update((options) => ({
			...options,
			columns,
			data: response.data
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

<div class="{className} relative w-full overflow-auto">
	<table class="w-full caption-bottom rounded-lg">
		<!-- Header -->
		<TableHeader>
			{#each $table.getHeaderGroups() as headerGroup}
				<TableRow>
					{#each headerGroup.headers as header}
						<TableHead>
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
		<TableBody>
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
		</TableBody>

		<!-- Footer -->
		<TableFooter>
			<TableRow>
				<td colspan={columns.length} class="h-10 border-t">
					<div class="flex w-full flex-row items-center justify-end gap-1 text-black">
						<!-- Show pagination if there is a page set -->
						{#if page}
							<Button
								disabled={page <= 1}
								on:click={() => (page ? (page -= 1) : null)}
								variant="ghost"><ChevronLeftIcon /></Button
							>
							<span class="text-base">{page}</span>
							<Button on:click={() => (page ? (page += 1) : null)} variant="ghost"
								><ChevronRightIcon /></Button
							>
						{/if}
					</div>
				</td>
			</TableRow>
		</TableFooter>
	</table>
</div>

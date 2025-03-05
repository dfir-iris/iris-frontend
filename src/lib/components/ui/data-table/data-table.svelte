<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { createGrid } from 'ag-grid-community';
	import type { FirstDataRenderedEvent, GridOptions } from 'ag-grid-community';
	import { mode } from 'mode-watcher';
	import 'ag-grid-community/styles/ag-grid.css';
	import 'ag-grid-community/styles/ag-theme-quartz.css';
	import { Input } from '$lib/components/ui/input';
	import { Search, PlusCircle } from 'lucide-svelte';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { Badge } from '$lib/components/ui/badge';
	import { MoreHorizontal, X } from 'lucide-svelte';
	import type { QuickFilter } from '$lib/types/quick-filter';
	import { Button } from '$lib/components/ui/button';
	import { Separator } from '$lib/components/ui/separator';

	let currentTheme: 'dark' | 'light' | undefined;
	mode.subscribe((value) => {
		currentTheme = value;
	});

	let grid: any = null;
	let gridRef: any = null;
	let api: any = null;
	let columnApi: any = null;

	let searchText = '';
	let selectedFilters: Record<string, Set<string>> = {};

	export let quickFilters: QuickFilter[] = [];

	function removeFilter(field: string, value: string) {
		selectedFilters[field]?.delete(value);
		selectedFilters = selectedFilters;
		applyFilters();
	}

	export const gridOptions: GridOptions = {
		pagination: true,
		paginationPageSize: 10,
		paginationPageSizeSelector: [10, 25, 50, 100],
		quickFilterText: searchText,
		defaultColDef: {
			sortable: true,
			filter: 'agTextColumnFilter',
			filterParams: {
				defaultOption: 'contains',
				textMatcher: (params) => {
					const value = params.value?.toString() || '';
					const filterText = params.filter;
					return value.includes(filterText);
				}
			}
		},
		domLayout: 'normal',
		animateRows: true,
		onFirstDataRendered: onFirstDataRendered,
		onGridReady: (params) => {
			params.api.sizeColumnsToFit();
			api = params.api;
			columnApi = params.columnApi;
		}
	};

	export let rowData = [];
	export let columnDefs = [];

	function onFirstDataRendered(params: FirstDataRenderedEvent) {
		params.api.sizeColumnsToFit();
	}

	onMount(() => {
		grid = createGrid(gridRef, {
			...gridOptions,
			rowData,
			columnDefs
		});
	});

	const updateData = (newRowData) => {
		if (!api) return;
		api.setGridOption('rowData', newRowData);
	};

	onDestroy(() => {
		if (grid) {
			grid.destroy();
		}
	});

	$: updateData(rowData);
	$: gridThemeClass = currentTheme === 'dark' ? 'ag-theme-quartz-dark' : 'ag-theme-quartz';

	function applyFilters() {
		if (!api) return;

		const filterModel = {};
		Object.entries(selectedFilters).forEach(([field, values]) => {
			if (values.size > 0) {
				filterModel[field] = {
					filterType: 'text',
					operator: 'OR',
					conditions: Array.from(values).map((value) => ({
						type: 'contains',
						filter: value
					}))
				};
			}
		});

		api.setFilterModel(filterModel);
	}

	function toggleFilter(field: string, value: string) {
		if (!selectedFilters[field]) {
			selectedFilters[field] = new Set();
		}

		if (selectedFilters[field].has(value)) {
			selectedFilters[field].delete(value);
		} else {
			selectedFilters[field].add(value);
		}
		selectedFilters = selectedFilters;
		applyFilters();
	}

	$: if (api && selectedFilters) {
		applyFilters();
	}

	$: if (api) {
		api.setGridOption('quickFilterText', searchText);
	}
</script>

<div class="flex flex-col gap-4">
	{#if rowData.length === 0}
		<div class="text-center text-muted-foreground">No data available</div>
	{:else}
		<div class="flex items-center space-x-2">
			<Search class="h-4 w-4 text-muted-foreground" />
			<Input type="text" bind:value={searchText} placeholder="Search..." class="h-8 w-[250px]" />
			{#each quickFilters as filter}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger class="inline-flex items-center justify-center text-sm font-medium">
						<Button variant="outline" class="flex items-center gap-2 border-dashed">
							<span>{filter.label}</span>
							{#if selectedFilters[filter.field]?.size > 0}
								<Separator orientation="vertical" class="h-4" />
								{#if selectedFilters[filter.field].size === 1}
									{#each Array.from(selectedFilters[filter.field]) as value}
										<Badge variant="secondary" class="flex items-center gap-1">
											{filter.options.find((o) => o.value === value)?.label}
											<button
												class="rounded-full p-0.5 hover:bg-destructive/50"
												on:click|stopPropagation={() => removeFilter(filter.field, value)}
											>
												<X class="h-2 w-2" />
											</button>
										</Badge>
									{/each}
								{:else}
									<Badge>{selectedFilters[filter.field].size} selected</Badge>
								{/if}
							{/if}
						</Button>
					</DropdownMenu.Trigger>
					<DropdownMenu.Content>
						<DropdownMenu.Label>{filter.label}</DropdownMenu.Label>
						{#each filter.options as option}
							<DropdownMenu.CheckboxItem
								checked={selectedFilters[filter.field]?.has(option.value)}
								onCheckedChange={() => toggleFilter(filter.field, option.value)}
							>
								{option.label}
							</DropdownMenu.CheckboxItem>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{/each}
		</div>
		<div bind:this={gridRef} class="{gridThemeClass} w-full"></div>
	{/if}
</div>

<style>
	:global(.ag-root-wrapper-body.ag-layout-normal) {
		height: auto;
		min-height: 200px;
	}
	:global([data-theme='dark']) {
		--ag-background-color: hsl(var(--background));
		--ag-border-color: hsl(var(--border));
		--ag-header-background-color: hsl(var(--muted));
		--ag-odd-row-background-color: hsl(var(--muted));
		--ag-row-hover-color: hsl(var(--accent));
		--ag-header-foreground-color: hsl(var(--foreground));
		--ag-foreground-color: hsl(var(--foreground));
	}
</style>
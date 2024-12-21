<script lang="ts">
	import { onMount, mount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { RefreshCw } from 'lucide-svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import DataTable from '$lib/components/ui/data-table/data-table.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import CellTitle from '$lib/components/ui/data-table/cell-title.svelte';
	import SeverityBadge from '$lib/components/ui/badge/severity-badge.svelte';
	import StateBadge from '$lib/components/ui/badge/state-badge.svelte';
	import { cellRendererFactory } from '$lib/components/ui/data-table/cell-renderer-factory';
	import { TimeFormatter } from '$lib/utils/time-formatter';
	import { invalidate } from '$app/navigation';

	import type { Case } from '$lib/types/resources/case';
	import type { RequestResponse } from '$lib/services/api.service';

	let {
		cases
	}: {
		cases: Promise<RequestResponse<Case[]>>;
	} = $props();

	let columnDefs = [
		{
			field: 'title',
			headerName: 'Title',
			sortable: true,
			filter: true,
			getQuickFilterText: (params: any) => params.value,
			cellRenderer: (params: any) => {
				return cellRendererFactory((target, p) => {
					mount(CellTitle, {
						target,
						props: {
							params: {
								title: p.data?.name,
								redirUrl: `/case/${p.data?.case_id || 0}`
							}
						}
					});
				})(params);
			}
		},
		{
			field: 'initial_date',
			headerName: 'Opening date',
			sortable: true,
			filter: true,
			getQuickFilterText: (params: any) => {
				return TimeFormatter.format(params.value, {
					timezone: 'Europe/Paris',
					format: 'medium',
					locale: 'fr-FR'
				});
			},
			valueFormatter: (params: any) => {
				return TimeFormatter.format(params.value, {
					timezone: 'Europe/Paris',
					format: 'medium',
					locale: 'fr-FR'
				});
			}
		},
		{ field: 'client.customer_name', headerName: 'Client', sortable: true, filter: true },
		{
			field: 'state.state_name',
			headerName: 'State',
			sortable: true,
			filter: 'agTextColumnFilter',
			filterParams: {
				maxNumConditions: 2,
				textMatcher: ({
					filterOption,
					value,
					filterText
				}: {
					filterOption: any;
					value: string;
					filterText: string;
				}) => {
					return value === filterText;
				}
			},
			cellRenderer: (params: any) => {
				return cellRendererFactory((target, p) => {
					const state_value = p?.data?.state?.state_name;
					mount(StateBadge, {
						target,
						props: {
							state: state_value
						}
					});
				})(params);
			}
		},
		{
			field: 'severity.severity_name',
			headerName: 'Severity',
			sortable: true,
			filter: 'agTextColumnFilter',
			filterParams: {
				maxNumConditions: 3,
				textMatcher: ({
					filterOption,
					value,
					filterText
				}: {
					filterOption: any;
					value: string;
					filterText: string;
				}) => {
					return value === filterText;
				}
			},
			cellRenderer: (params: any) => {
				return cellRendererFactory((target, p) => {
					const severity = p?.data?.severity?.severity_name;
					if (severity) {
						mount(SeverityBadge, {
							target,
							props: {
								severity
							}
						});
					}
				})(params);
			}
		}
	];

	let quickFilters = [
		{
			field: 'state.state_name',
			label: 'State',
			options: [
				{ value: 'Open', label: 'Open' },
				{ value: 'Closed', label: 'Closed' }
			]
		},
		{
			field: 'severity.severity_name',
			label: 'Severity',
			options: [
				{ value: 'High', label: 'High' },
				{ value: 'Medium', label: 'Medium' },
				{ value: 'Low', label: 'Low' }
			]
		}
	];
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
		<Card.Title class="text-sm font-medium">Owned Cases</Card.Title>
		<Button variant="ghost" size="icon" on:click={() => invalidate('cases')}>
			<RefreshCw class="h-4 w-4" />
		</Button>
	</Card.Header>
	<Card.Content class="items-center justify-between pb-2">
		{#await cases}
			<div class="space-y-2">
				{#each Array(5) as _}
					<div class="grid grid-cols-3 gap-4">
						<Skeleton class="h-8" />
						<Skeleton class="h-8" />
						<Skeleton class="h-8" />
					</div>
				{/each}
			</div>
		{:then cases}
			<DataTable rowData={cases.data} {columnDefs} {quickFilters} />
		{/await}
	</Card.Content>
</Card.Root>

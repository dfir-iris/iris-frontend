<script lang="ts">
	import { onMount, mount } from 'svelte';
	import { Button } from '$lib/components/ui/button';
	import { RefreshCw } from 'lucide-svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import DataTable from '$lib/components/ui/data-table/data-table.svelte';
	import { ApiService } from '$lib/services/api.service';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import CellTitle from '$lib/components/ui/data-table/cell-title.svelte';
	import { cellRendererFactory } from '$lib/components/ui/data-table/cell-renderer-factory';
	import { TimeFormatter } from '$lib/utils/time-formatter';
	import { ENDPOINTS } from '$lib/constants/endpoints';
	import { assetsStore, isLoadingAssetsStore } from '$lib/stores/assets.store';

	let columnDefs = [
		{
			field: 'asset_name',
			headerName: 'Asset Name',
			sortable: true,
			filter: true,
			getQuickFilterText: (params: any) => params.value,
			cellRenderer: (params: any) => {
				return cellRendererFactory((target, p) => {
					mount(CellTitle, {
						target,
						props: {
							params: {
								title: p.data?.asset_name,
								redirUrl: `/case?cid=${p.data?.case_id || 0}`
							}
						}
					});
				})(params);
			}
		},
		{
			field: 'asset_type',
			headerName: 'Type',
			sortable: true,
			filter: true
		},
		{ field: 'asset_ip', headerName: 'IP', sortable: true, filter: true },
		{
			field: 'asset.asset_compromise_status_id',
			headerName: 'State',
			sortable: true
		}
	];

	let quickFilters = [
		//   {
		//     field: 'state.state_name',
		//     label: 'State',
		//     options: [
		//             { value: 'Open', label: 'Open' },
		//             { value: 'Closed', label: 'Closed' }
		//         ]
		//   },
		//   {
		//     field: 'severity.severity_name',
		//     label: 'Severity',
		//     options: [
		//             { value: 'High', label: 'High' },
		//             { value: 'Medium', label: 'Medium' },
		//             { value: 'Low', label: 'Low' }
		//         ]
		//   },
	];

	async function fetchAssets() {
		isLoadingAssetsStore.set(true);
		try {
			const params = new URLSearchParams(location.search);
			const case_id = parseInt(params.get('cid')) || 0;
			const response_data = await ApiService.get(ENDPOINTS.case.assets.list(case_id));
			assetsStore.set(response_data);
		} catch (error) {
			console.error('Error fetching cases:', error);
		} finally {
			isLoadingAssetsStore.set(false);
		}
	}

	onMount(fetchAssets);
</script>

<Card.Root>
	<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
		<Card.Title>Assets</Card.Title>
		<Button variant="ghost" size="icon" onclick={fetchAssets}>
			<RefreshCw class="h-4 w-4" />
		</Button>
	</Card.Header>
	<Card.Content class="items-center justify-between pb-2">
		{#if $isLoadingAssetsStore}
			<div class="space-y-2">
				{#each Array(5) as _}
					<div class="grid grid-cols-3 gap-4">
						<Skeleton class="h-8" />
						<Skeleton class="h-8" />
						<Skeleton class="h-8" />
					</div>
				{/each}
			</div>
		{:else}
			<DataTable rowData={$assetsStore.assets} {columnDefs} {quickFilters} />
		{/if}
	</Card.Content>
</Card.Root>

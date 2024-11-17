<script lang="ts">
    import { onMount, mount } from 'svelte';
    import { Button } from "$lib/components/ui/button";
    import { RefreshCw } from "lucide-svelte";
    import * as Card from "$lib/components/ui/card/index.js";
    import DataTable from '$lib/components/ui/data-table/data-table.svelte';
    import { ApiService } from '$lib/services/api.service';
    import { Skeleton } from "$lib/components/ui/skeleton";
    import CellTitle from '$lib/components/ui/data-table/cell-title.svelte';
    import SeverityBadge from '$lib/components/ui/badge/severity-badge.svelte';
    import StateBadge from '$lib/components/ui/badge/state-badge.svelte';
    import { cellRendererFactory } from '$lib/components/ui/data-table/cell-renderer-factory';
    import { TimeFormatter } from '$lib/utils/time-formatter';
    import { casesStore, isLoadingStore } from '$lib/stores/cases.store';
  
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
                params: p,
              },
            });
          })(params);
        },
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
            locale: 'fr-FR',
          });
        },
        valueFormatter: (params: any) => {
          return TimeFormatter.format(params.value, {
            timezone: 'Europe/Paris',
            format: 'medium',
            locale: 'fr-FR',
          });
        },
      },
      { field: 'client.customer_name', headerName: 'Client', sortable: true, filter: true },
      {
        field: 'state.state_name',
        headerName: 'State',
        sortable: true,
        filter: true,
        cellRenderer: (params: any) => {
          return cellRendererFactory((target, p) => {
            const state = p?.data?.state?.state_name;
            mount(StateBadge, {
              target,
              props: {
                state,
              },
            });
          })(params);
        },
      },
      {
        field: 'severity.severity_name',
        headerName: 'Severity',
        sortable: true,
        filter: true,
        cellRenderer: (params: any) => {
          return cellRendererFactory((target, p) => {
            const severity = p?.data?.severity?.severity_name;
            if (severity) {
              mount(SeverityBadge, {
                target,
                props: {
                  severity,
                },
              });
            }
          })(params);
        },
      },
    ];

    let quickFilters = [
      {
        field: 'state.state_name',
        label: 'State',
        options: [
                { value: 'High', label: 'High' },
                { value: 'Medium', label: 'Medium' },
                { value: 'Low', label: 'Low' }
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
      },
    ];
  
    async function fetchCases() {
      isLoadingStore.set(true);
      try {
        const response_data = await ApiService.get('/user/cases/list?cid=1&show_closed=false');
        casesStore.set(response_data);
      } catch (error) {
        console.error('Error fetching cases:', error);
      } finally {
        isLoadingStore.set(false);
      }
    }
  
    onMount(fetchCases);
  </script>
  
  <Card.Root>
    <Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
      <Card.Title class="text-sm font-medium">Owned Cases</Card.Title>
      <Button variant="ghost" size="icon" on:click={fetchCases}>
        <RefreshCw class="h-4 w-4" />
      </Button>
    </Card.Header>
    <Card.Content class="items-center justify-between pb-2">
      {#if $isLoadingStore}
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
        <DataTable 
        rowData={$casesStore} 
        columnDefs={columnDefs} 
        quickFilters={quickFilters}
        />
      {/if}
    </Card.Content>
  </Card.Root>
  
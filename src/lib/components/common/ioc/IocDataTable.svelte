<script lang="ts">
    import type { Ioc } from '$lib/types/resources/ioc';
    import { renderComponent, type ColumnDef } from '@tanstack/svelte-table';
    import DataTable from '$lib/components/ui/data-table-tanstack/data-table.svelte';
    import { mediumDateTimeFormatter } from '$lib/utils/time-formatter'; // Assuming IOCs might have dates
    import StatusBadge from '$lib/components/ui/badge/status-badge.svelte'; // Or a TLPBadge if more appropriate
    import { LinkCell } from '$lib/components/ui/table';
    import Skeleton from '$lib/components/ui/skeleton/skeleton.svelte';
    import { page } from '$app/stores';
    import { Button } from '$lib/components/ui/button';
    import { Trash2 } from 'lucide-svelte';
    import { iocsStore, deleteIoc as deleteIocAction } from '$lib/stores/iocs.store'; // Assuming delete action in store

    export let iocs: Ioc[];
    export let caseId: string | number;
    export let class: string = '';

    // Columns configuration for IOCs
    const columns: ColumnDef<Ioc>[] = [
        {
            accessorKey: 'ioc_value',
            header: () => 'Value',
            cell: (cell) => {
                // Link to individual IOC view if it exists, e.g., /case/[case_id]/ioc/[ioc_id]
                // For now, just display the value or link to a placeholder/details view
                return renderComponent(LinkCell, {
                    href: `/case/${caseId}/ioc/${cell.row.original.ioc_id}`,
                    label: `${cell.getValue()}`
                });
            }
        },
        {
            accessorKey: 'ioc_type.type_name',
            header: () => 'Type',
        },
        {
            accessorKey: 'tlp.tlp_name',
            header: () => 'TLP',
            cell: (cell) => {
                // Could use a specific TLPBadge here if available, similar to StatusBadge
                // For now, using StatusBadge with TLP color if possible, or just text
                const tlpName = cell.getValue() as string;
                const tlpColor = cell.row.original.tlp?.tlp_bscolor || 'secondary'; // default color
                // This might need adjustment based on how StatusBadge handles arbitrary colors/text
                return renderComponent(StatusBadge, { status: tlpName, class: `bg-${tlpColor}-100 text-${tlpColor}-700` });
            }
        },
        {
            accessorKey: 'ioc_description',
            header: () => 'Description',
            cell: (cell) => cell.getValue() || '-'
        },
        {
            accessorKey: 'ioc_tags',
            header: () => 'Tags',
            cell: (cell) => cell.getValue() || '-'
        },
        // Potentially add 'Added Date' or 'User' if available and relevant
        // {
        //     accessorKey: 'created_at', // Assuming a timestamp field
        //     header: () => 'Added On',
        //     cell: (cell) => {
        //         const asDate = new Date(`${cell.getValue()}`);
        //         return mediumDateTimeFormatter(asDate);
        //     }
        // },
        {
            id: 'actions',
            header: 'Actions',
            cell: (cell) => {
                const ioc = cell.row.original;
                return renderComponent(Button, {
                    variant: 'ghost',
                    size: 'sm',
                    title: 'Delete IOC',
                    children: renderComponent(Trash2, { class: 'h-4 w-4 text-destructive' }),
                    on_click: async () => {
                        if (confirm(`Are you sure you want to delete IOC: ${ioc.ioc_value}?`)) {
                            await deleteIocAction(caseId, ioc.ioc_id);
                            // The store should ideally trigger a re-render or update the list
                        }
                    }
                });
            }
        }
    ];
</script>

<div class="{class} flex overflow-hidden rounded border bg-card pt-1">
    {#if !iocs || iocs.length === 0}
        <div class="p-4 text-center w-full">
            <p>No IOCs to display.</p>
        </div>
    {:else}
        <DataTable {columns} data={iocs} page={$page.data.iocs?.current_page || 1}></DataTable>
        <!-- Note: Pagination might need to be handled by passing total/last_page from store/API response -->
    {/if}
</div>

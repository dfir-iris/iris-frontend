<script lang="ts">
    import { assetsStore, isLoadingAssetsStore } from '$lib/stores/assets.store';
    import CaseAssetsTable from './[components]/case-assets-table.svelte';
    
    export async function load() {
        return {
            title: 'Assets'
        };
    }
</script>

<div>
    <CaseAssetsTable />
</div>
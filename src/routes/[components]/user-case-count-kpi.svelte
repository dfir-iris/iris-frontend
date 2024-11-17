<script lang="ts">
    import * as Card from "$lib/components/ui/card";
    import { Layers } from "lucide-svelte";
    import { Skeleton } from "$lib/components/ui/skeleton";
    import { casesStore, isLoadingStore } from '$lib/stores/cases.store';

    $: caseCount = $casesStore.length;
</script>

<Card.Root>
    <Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
        <Card.Title class="text-sm font-medium">Owned Cases</Card.Title>
        <Layers class="text-muted-foreground h-4 w-4" />
    </Card.Header>
    <Card.Content>
        {#if $isLoadingStore}
            <Skeleton class="h-8 w-[100px]" />
            <Skeleton class="h-4 w-[70px] mt-2" />
        {:else}
            <div class="text-2xl font-bold">{caseCount}</div>
            <p class="text-muted-foreground text-xs">Active cases</p>
        {/if}
    </Card.Content>
</Card.Root>
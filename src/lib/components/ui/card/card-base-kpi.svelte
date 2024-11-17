<script lang="ts">
    import * as Card from "$lib/components/ui/card";
    import { Skeleton } from "$lib/components/ui/skeleton";
    import { CircleFadingArrowUp, CircleCheckBig } from "lucide-svelte";
    import * as Tooltip from "$lib/components/ui/tooltip";
    
    export let title: string;
    export let icon;
    export let value: number;
    export let subtitle: string;
    export let isActive: boolean = false;
    export let isLoading: boolean = false;
    export let onClick: () => void;
</script>

<Card.Root 
    class="transition-all cursor-pointer hover:scale-105 {isActive ? 'bg-muted border-primary/20 shadow-md' : ''}"
    on:click={onClick}
>
    <Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
        <Card.Title class="text-sm font-medium">{title}</Card.Title>
        <svelte:component this={icon} class="text-muted-foreground h-4 w-4" />
    </Card.Header>
    <Card.Content>
        {#if isLoading}
            <Skeleton class="h-8 w-[100px]" />
            <Skeleton class="h-4 w-[70px] mt-2" />
        {:else}
            <div class="flex items-center gap-2">
                <span class="text-2xl font-bold">{value > 0 ? value : 'All clear' }</span>
                <Tooltip.Root>
                    <Tooltip.Trigger>
                        {#if value > 0}
                            <CircleFadingArrowUp class="h-4 w-4 text-orange-500 transition-colors" />
                        {:else}
                            <CircleCheckBig class="h-4 w-4 text-green-500 transition-colors" />
                        {/if}
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                        {value > 0 ? 'Requires attention' : 'All clear'}
                    </Tooltip.Content>
                </Tooltip.Root>
            </div>
            <p class="text-muted-foreground text-xs">{value > 0 ? subtitle : ''}</p>
        {/if}
    </Card.Content>
</Card.Root>
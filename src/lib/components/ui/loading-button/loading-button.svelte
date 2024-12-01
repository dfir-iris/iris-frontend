<script lang="ts">
    import { Button } from "$lib/components/ui/button";
    import { Icons } from "$lib/components/ui/icons";
    import { cn } from "$lib/utils";

    export let loading = false;
    export let variant: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link" = "default";
    export let size: "default" | "sm" | "lg" | "icon" = "default";
    export let className: string | undefined = undefined;
    let rest: any;
    $: ({ loading, variant, size, className, ...rest } = $$props);
</script>

<Button
    disabled={loading}
    variant={variant}
    size={size}
    class={cn(className)}
    on:click
    {...rest}
>
    {#if loading}
        <Icons.spinner class="mr-2 h-4 w-4 animate-spin" />
    {/if}
    <slot />
</Button>
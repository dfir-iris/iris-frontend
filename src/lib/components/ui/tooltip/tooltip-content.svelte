<script lang="ts">
	import { Tooltip as TooltipPrimitive } from "bits-ui";
	import { onMount } from "svelte";
	import { cn } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		sideOffset = 4,
		...restProps
	}: TooltipPrimitive.ContentProps = $props();

	// Portal only after mount — bits-ui's Portal renders null during SSR
	// and then tries to append to <body> on the client, producing a
	// hydration mismatch ("Cannot add children to a Text"). Waiting until
	// after hydration sidesteps that: the server renders nothing here,
	// the client renders nothing on first tick, then flips to portalled
	// once hydration is done.
	let mounted = $state(false);
	onMount(() => {
		mounted = true;
	});

	const contentClass = cn(
		"bg-popover text-popover-foreground border border-border/60 shadow-elevation-2 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-[100] overflow-hidden rounded-lg px-3 py-1.5 text-xs",
		className
	);
</script>

<!--
  Portal to <body> so the tooltip escapes any ancestor with `overflow-hidden`
  or a stacking context (e.g. dashboard KPI cards which clip the accent bar
  and would otherwise clip the tooltip). Only portal after mount to avoid a
  hydration mismatch — see the `mounted` guard above.
-->
{#if mounted}
	<TooltipPrimitive.Portal>
		<TooltipPrimitive.Content bind:ref {sideOffset} class={contentClass} {...restProps} />
	</TooltipPrimitive.Portal>
{:else}
	<TooltipPrimitive.Content bind:ref {sideOffset} class={contentClass} {...restProps} />
{/if}

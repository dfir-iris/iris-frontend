<script lang="ts">
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	class={cn(
		'shadow-elevation-2 flex flex-col rounded-xl border border-border/60 bg-card text-card-foreground transition-shadow duration-200',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

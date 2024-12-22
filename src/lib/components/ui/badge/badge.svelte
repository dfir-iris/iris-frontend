<script lang="ts">
	import { type Variant, badgeVariants } from './index.js';
	import { cn } from '$lib/utils.js';
	import type { Icon } from 'lucide-svelte';

	let className: string | undefined | null = undefined;
	export let href: string | undefined = undefined;
	export let variant: Variant = 'default';
	export { className as class };

	export let icon: typeof Icon | undefined = undefined;
</script>

<svelte:element
	this={href ? 'a' : 'span'}
	{href}
	class={cn(badgeVariants({ variant, className }), 'gap-x-1')}
	{...$$restProps}
>
	<svelte:component this={icon} class="!h-3 !w-3" />
	<slot />
</svelte:element>

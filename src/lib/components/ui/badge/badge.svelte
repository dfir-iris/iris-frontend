<script lang="ts">
	import { type Variant, badgeVariants } from './index.js';
	import { cn } from '$lib/utils.js';
	import type { Icon } from 'lucide-svelte';
	import { Tooltip, TooltipTrigger, TooltipProvider } from '../tooltip/index.js';
	import TooltipContent from '../tooltip/tooltip-content.svelte';

	let className: string | undefined | null = undefined;
	export let href: string | undefined = undefined;
	export let variant: Variant = 'default';
	export { className as class };

	export let icon: typeof Icon | undefined = undefined;
	export let tooltip: string | undefined = undefined;
</script>

<TooltipProvider>
	<Tooltip>
		<TooltipTrigger class="cursor-default">
			<svelte:element
				this={href ? 'a' : 'span'}
				{href}
				class={cn(badgeVariants({ variant, className }), 'gap-x-1')}
				{...$$restProps}
			>
				<svelte:component this={icon} class="h-3.5 w-3.5" />
				<slot />
			</svelte:element>
		</TooltipTrigger>
		<TooltipContent>{tooltip}</TooltipContent>
	</Tooltip>
</TooltipProvider>
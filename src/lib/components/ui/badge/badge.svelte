<script lang="ts" module>
	import { type VariantProps, tv } from 'tailwind-variants';
	export const badgeVariants = tv({
		base: 'focus:ring-ring inline-flex select-none items-center rounded-lg border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2',
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground hover:bg-primary/80 border-transparent shadow-sm',
				secondary:
					'bg-secondary text-secondary-foreground hover:bg-secondary/80 border-transparent',
				destructive:
					'bg-destructive text-destructive-foreground hover:bg-destructive/80 border-transparent shadow-sm',
				compromised: 'bg-red-700 text-red-50 hover:bg-red-600 border-transparent',
				green: 'bg-emerald-700 text-emerald-50 hover:bg-emerald-600 border-transparent',
				outline: 'text-foreground'
			}
		},
		defaultVariants: {
			variant: 'default'
		}
	});

	export type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];
</script>

<script lang="ts">
	import type { SvelteComponent } from 'svelte';
	// Define a type alias for any Svelte component constructor
	type ComponentType = new (...args: any) => SvelteComponent;

	import {
		Tooltip,
		TooltipContent,
		TooltipProvider,
		TooltipTrigger
	} from '$lib/components/ui/tooltip';
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLAnchorAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils.js';

	// Destructure props and rename "icon" to "Icon" (uppercase) for dynamic rendering.
	let {
		icon: Icon = null,
		ref = $bindable(null),
		href,
		class: className,
		variant = 'default',
		tooltip,
		children,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
		tooltip?: string;
		// Use the ComponentType alias to type the icon prop
		icon?: ComponentType;
	} = $props();
</script>

{#if tooltip}
	<TooltipProvider>
		<Tooltip>
			<TooltipTrigger class="cursor-default">
				<svelte:element
					this={href ? 'a' : 'span'}
					bind:this={ref}
					{href}
					class={cn(badgeVariants({ variant }), className)}
					{...restProps}
				>
					{#if Icon}
						<span class="mr-1">
							<Icon class="h-3.5 w-3.5" />
						</span>
					{/if}
					{@render children?.()}
				</svelte:element>
			</TooltipTrigger>
			<TooltipContent align="center" side="bottom">
				<p>{tooltip}</p>
			</TooltipContent>
		</Tooltip>
	</TooltipProvider>
{:else}
	<svelte:element
		this={href ? 'a' : 'span'}
		bind:this={ref}
		{href}
		class={cn(badgeVariants({ variant }), className)}
		{...restProps}
	>
		{#if Icon}
			<span class="">
				<Icon class="h-3.5 w-3.5" />
			</span>
		{/if}
		{@render children?.()}
	</svelte:element>
{/if}

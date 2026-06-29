<script lang="ts" module>
	import type { WithElementRef } from 'bits-ui';
	import type { HTMLAnchorAttributes, HTMLButtonAttributes } from 'svelte/elements';
	import { type VariantProps, tv } from 'tailwind-variants';

	export const buttonVariants = tv({
		base: 'focus-visible:ring-ring inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 transition-all',
		variants: {
			variant: {
				default:
					'bg-primary text-primary-foreground hover:bg-primary/85 shadow-md hover:shadow-lg active:scale-[0.98]',
				destructive:
					'bg-destructive text-destructive-foreground hover:bg-destructive/85 shadow-md hover:shadow-lg active:scale-[0.98]',
				outline:
					'border-input bg-background hover:bg-accent hover:text-accent-foreground border shadow-sm hover:shadow-md',
				secondary:
					'bg-secondary text-secondary-foreground hover:bg-secondary/70 shadow-sm hover:shadow-md',
				ghost: 'hover:bg-accent hover:text-accent-foreground',
				link: 'text-link underline-offset-4 hover:underline hover:text-link-hover',
				dotted:
					'border border-dashed border-input bg-background hover:bg-accent hover:text-accent-foreground'
			},
			size: {
				default: 'h-10 px-5 py-2',
				xs: 'h-7 rounded-md px-2.5 text-xs',
				sm: 'h-8 rounded-lg px-3.5 text-xs',
				lg: 'h-11 rounded-lg px-8',
				icon: 'h-9 w-9'
			}
		},
		defaultVariants: {
			variant: 'default',
			size: 'default'
		}
	});

	export type ButtonVariant = VariantProps<typeof buttonVariants>['variant'];
	export type ButtonSize = VariantProps<typeof buttonVariants>['size'];

	export type ButtonProps = WithElementRef<HTMLButtonAttributes> &
		WithElementRef<HTMLAnchorAttributes> & {
			variant?: ButtonVariant;
			size?: ButtonSize;
		};
</script>

<script lang="ts">
	import { cn } from '$lib/utils.js';

	let {
		class: className,
		variant = 'default',
		size = 'default',
		ref = $bindable(null),
		href = undefined,
		type = 'button',
		children,
		...restProps
	}: ButtonProps = $props();
</script>

{#if href}
	<a bind:this={ref} class={cn(buttonVariants({ variant, size }), className)} {href} {...restProps}>
		{@render children?.()}
	</a>
{:else}
	<button
		bind:this={ref}
		class={cn(buttonVariants({ variant, size }), className)}
		{type}
		{...restProps}
	>
		{@render children?.()}
	</button>
{/if}

<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Tooltip from '$lib/components/ui/tooltip';

	import { CircleFadingArrowUp, CircleCheckBig } from 'lucide-svelte';
	import { type Icon as IconType } from 'lucide-svelte';

	export let title: string;
	export let icon: typeof IconType;
	export let value: number;
	export let subtitle: string = '';
	export let isActive: boolean = false;
	export let isLoading: boolean = false;
	export let onClick: () => void = () => {};
</script>

<Card.Root
	class="hover:shadow-elevation-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 {isActive
		? 'shadow-glow-primary border-primary/30 ring-1 ring-primary/20'
		: ''} h-full"
	onclick={onClick}
>
	<Card.Header class="flex flex-row items-center justify-between space-y-0 p-5 pb-2">
		<Card.Title class="text-sm font-medium text-muted-foreground">{title}</Card.Title>
		<div class="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
			<svelte:component this={icon} class="!h-5 !w-5 text-primary" />
		</div>
	</Card.Header>

	<Card.Content class="p-5 pt-0">
		{#if isLoading}
			<Skeleton class="h-8 w-[100px]" />
			<Skeleton class="mt-2 h-4 w-[70px]" />
		{:else}
			<div class="flex items-center gap-2">
				<span class="text-3xl font-bold tracking-tight">{value > 0 ? value : 'All clear'}</span>
				<Tooltip.Provider>
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#if value > 0}
								<CircleFadingArrowUp class="h-4 w-4 text-orange-500 transition-colors" />
							{:else}
								<CircleCheckBig class="h-4 w-4 text-emerald-500 transition-colors" />
							{/if}
						</Tooltip.Trigger>
						<Tooltip.Content>
							{value > 0 ? 'Requires attention' : 'All clear'}
						</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
			</div>
			{#if subtitle && value > 0}
				<p class="mt-1 text-xs text-muted-foreground">{subtitle}</p>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>

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
	class="cursor-pointer transition-all hover:scale-105 {isActive
		? 'border-primary/20 bg-muted/10 text-foreground shadow-md'
		: ''}"
	onclick={onClick}
>
	<Card.Header class="flex flex-row items-center justify-between space-y-0 pb-2">
		<Card.Title class="text-sm font-medium">{title}</Card.Title>
		<svelte:component this={icon} class="!h-6 !w-6 text-muted-foreground" />
	</Card.Header>

	<Card.Content>
		{#if isLoading}
			<Skeleton class="h-8 w-[100px]" />
			<Skeleton class="mt-2 h-4 w-[70px]" />
		{:else}
			<div class="flex items-center gap-2">
				<span class="text-2xl font-bold">{value > 0 ? value : 'All clear'}</span>
				<Tooltip.Provider>
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
				</Tooltip.Provider>
			</div>
			{#if subtitle && value > 0}
				<p class="text-xs text-muted-foreground">{subtitle}</p>
			{/if}
		{/if}
	</Card.Content>
</Card.Root>

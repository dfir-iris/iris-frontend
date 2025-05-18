<script lang="ts">
	import type { Route } from '$lib/constants/routes';
	import { Button } from '$lib/components/ui/button';
	import { page } from '$app/stores';
	import { cn } from '$lib/utils.js';
	import * as Tooltip from '$lib/components/ui//tooltip';

	export let isCollapsed: boolean;
	export let routes: Route[];

	const isRouteActive = (href: string) => {
		const currentPath = $page.url.pathname;

		// Handle the root path specifically: it's active only on exact match.
		if (href === '/') {
			return currentPath === '/';
		}

		// For other paths, normalize the href by removing a potential trailing slash
		// to simplify comparisons. $page.url.pathname usually doesn't have a trailing slash
		// unless it's the root.
		const normalizedHref = href.endsWith('/') ? href.slice(0, -1) : href;

		// Active if currentPath is an exact match to the normalized href
		if (currentPath === normalizedHref) {
			return true;
		}

		// Active if currentPath starts with the normalized href followed by a '/'
		// This covers sub-paths, e.g., href="/assets", currentPath="/assets/id"
		if (currentPath.startsWith(normalizedHref + '/')) {
			return true;
		}

		return false;
	};
</script>

<div data-collapsed={isCollapsed} class="group flex flex-col gap-4 py-2 data-[collapsed=true]:py-2">
	<nav
		class="grid gap-1 px-2 group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2"
	>
		{#each routes as route}
			{#if isCollapsed}
			<Tooltip.Provider>
					<Tooltip.Root openDelay={0}>
						<Tooltip.Trigger>
							<Button
								href={route.href}
								variant={route.variant}
								size="icon"
								class={cn(
									'size-9',
									isRouteActive(route.href) ? 'bg-primary-gradient text-white' : '', // Corrected 'te' to 'text-white'
									route.variant === 'default' &&
										'dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-white'
								)}
							>
								<svelte:component this={route.icon} class="size-4" aria-hidden="true" />
								<span class="sr-only">{route.title}</span>
							</Button>
						</Tooltip.Trigger>
						<Tooltip.Content side="right" class="flex items-center gap-4">
							{route.title}
							{#if route.label}
								<span class="ml-auto text-muted-foreground">
									{route.label}
								</span>
							{/if}
						</Tooltip.Content>
					</Tooltip.Root>
				</Tooltip.Provider>
			{:else}
				<Button
					href={route.href}
					variant={route.variant}
					size="sm"
					class={cn(
						'justify-start',
						isRouteActive(route.href) ? 'bg-primary-gradient text-white' : '',
						route.variant === 'default' &&
							'dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-white'
					)}
				>
					<svelte:component this={route.icon} class="mr-2 size-4" aria-hidden="true" />
					{route.title}
					{#if route.label}
						<span
							class={cn('ml-auto', {
								'text-background dark:text-white': route.variant === 'default'
							})}
						>
							{route.label}
						</span>
					{/if}
				</Button>
			{/if}
		{/each}
	</nav>
</div>

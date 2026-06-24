<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import {
		BookDashedIcon,
		CircleUserIcon,
		Icon,
		LayersIcon,
		LockKeyholeIcon,
		NewspaperIcon,
		ServerIcon,
		SettingsIcon,
		WaypointsIcon
	} from 'lucide-svelte';
	import { page } from '$app/state';

	let { data, children }: { data: LayoutData; children: Snippet } = $props();

	const pathname = $derived(page.url.pathname);

	const items: { icon: typeof Icon; label: string; href: string }[] = [
		{ icon: ServerIcon, label: 'Modules', href: '/modules' },
		{ icon: CircleUserIcon, label: 'Customers', href: '/customers' },
		{ icon: LayersIcon, label: 'Case Objects', href: '/case-objects' },
		{ icon: WaypointsIcon, label: 'Custom Attributes', href: '/custom-attributes' },
		{ icon: BookDashedIcon, label: 'Case Templates', href: '/case-templates' },
		{ icon: NewspaperIcon, label: 'Report Templates', href: '/report-templates' },
		{ icon: LockKeyholeIcon, label: 'Access Control', href: '/access-control' },
		{ icon: SettingsIcon, label: 'Server Settings', href: '/server' }
	];

	const isActive = (href: string) => {
		const target = `/settings${href}`;
		return pathname === target || pathname.startsWith(`${target}/`);
	};
</script>

<svelte:head>
	<title>Settings | DFIR-IRIS</title>
</svelte:head>

<!--
  `overflow-hidden` on the row keeps the viewport as the hard ceiling
  so the sidebar can never scroll out of view, even if a page's
  content card unexpectedly overflows. Each settings page is in
  charge of its own internal scrolling (`flex-1 overflow-y-auto`).
-->
<div class="flex h-screen w-screen flex-row gap-4 overflow-hidden p-4">
	<!--
	  Sidebar is `sticky top-0` as a belt-and-braces measure: even if a
	  future page forgets to contain its own overflow, the aside stays
	  parked at the top of the row instead of riding the scrollbar.
	-->
	<aside class="sticky top-0 flex h-full w-56 shrink-0 flex-col overflow-y-auto">
		<header class="flex items-center gap-2 px-2 pb-3">
			<SettingsIcon size={16} class="text-muted-foreground" />
			<h1 class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
				Manage IRIS
			</h1>
		</header>

		<nav class="flex flex-col gap-0.5">
			{#each items as item (item.href)}
				{@const active = isActive(item.href)}
				<a
					href={`/settings${item.href}`}
					class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors {active
						? 'bg-primary/10 font-medium text-foreground'
						: 'text-muted-foreground hover:bg-muted hover:text-foreground'}"
					aria-current={active ? 'page' : undefined}
				>
					<item.icon size={14} />
					{item.label}
				</a>
			{/each}
		</nav>
	</aside>

	<!--
	  Main page content. Uses `bg-card` (whiter than the page-level
	  `bg-background` grey) so the right pane reads as a distinct
	  surface raised over the sidebar column instead of blending in.
	-->
	<div class="flex h-full min-w-0 flex-1 flex-col rounded-md border bg-card shadow-elevation-1">
		{@render children()}
	</div>
</div>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { LayoutData } from './$types';
	import {
		BellIcon,
		BookDashedIcon,
		CheckSquareIcon,
		CircleUserIcon,
		FilterIcon,
		Icon,
		LayersIcon,
		LockKeyholeIcon,
		MailIcon,
		NewspaperIcon,
		PlugIcon,
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
		{ icon: BellIcon, label: 'Notifications', href: '/notifications' },
		{ icon: MailIcon, label: 'Mail rules', href: '/mail' },
		{ icon: FilterIcon, label: 'Clustering Rules', href: '/cluster-rules' },
		{ icon: CheckSquareIcon, label: 'Investigation flows', href: '/investigation-flows' },
		{ icon: PlugIcon, label: 'MCP Server', href: '/mcp' },
		{ icon: SettingsIcon, label: 'Server Settings', href: '/server' }
	];

	const isActive = (href: string) => {
		const target = `/settings${href}`;
		return pathname === target || pathname.startsWith(`${target}/`);
	};
</script>

<svelte:head>
	<title>Settings</title>
</svelte:head>

<!--
  `h-full w-full` — NOT `h-screen w-screen`. The settings layout sits
  inside the (app) layout's scroll viewport, which is already
  `viewport - topbar` tall. Claiming `h-screen` makes this container
  taller than its parent by exactly the topbar height; the surplus
  spills out the bottom and forces the parent (app) viewport to
  scroll, which is what dragged the Manage IRIS sidebar along.
  `overflow-hidden` plus a real height makes the viewport our hard
  ceiling so each settings page can manage its own internal scroll.
-->
<div class="flex h-full w-full flex-row gap-4 overflow-hidden p-4">
	<aside class="flex h-full w-56 shrink-0 flex-col overflow-y-auto">
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

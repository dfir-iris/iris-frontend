<script lang="ts">
	import { MenuIcon } from 'lucide-svelte';
	import UserMenu from './UserMenu.svelte';
	import SideNav from './SideNav.svelte';

	let collapsed = false;
	let hovered = false;

	const isCollapsed = () => (collapsed ? !hovered : collapsed);
</script>

<div class="sticky top-0 flex h-screen flex-col bg-sidebar">
	<div
		style="background-color: hsl(var(--iris-blue));"
		class={`flex max-h-14 min-h-14 items-center justify-center p-4 transition-all ${
			isCollapsed() ? 'min-w-0' : 'w-full min-w-60 justify-between'
		}`}
	>
		{#if !isCollapsed()}
			<img src="/img/logo/logo-white.png" alt="IRIS Logo" class="mx-3 h-6" />
		{/if}

		<div
			class="mx-1 flex items-center justify-center text-white/70 transition-colors hover:text-white"
		>
			<MenuIcon class="size-5 cursor-pointer" onclick={() => (collapsed = !collapsed)} />
		</div>
	</div>

	<div
		class="flex flex-1 flex-col overflow-y-auto border-r border-[hsl(var(--sidebar-border))] px-3"
		onmouseenter={() => (hovered = true)}
		onmouseleave={() => (hovered = false)}
		role="button"
		tabindex="0"
	>
		<div class="border-b border-[hsl(var(--sidebar-border))] py-3">
			<UserMenu collapsed={isCollapsed()} />
		</div>

		<div class="flex w-full py-3">
			<SideNav collapsed={isCollapsed()} />
		</div>
	</div>
</div>

<script lang="ts">
	import { getContext } from 'svelte';
	import { MenuIcon } from 'lucide-svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import UserMenu from './UserMenu.svelte';
	import SideNav from './SideNav.svelte';

	let hovered = $state(false);

	const userCtx = getContext<UserCtx>(USER_CTX);

	// The collapsed state lives on the user row (User.has_mini_sidebar)
	// so it survives logout / device-switch. We read it from the user
	// context once it's `ready`; before that we default to expanded so
	// the rail doesn't flash mini-then-expanded on first paint.
	const collapsed = $derived<boolean>(userCtx.ctx?.preferences?.has_mini_sidebar ?? false);
	const isCollapsed = () => (collapsed ? !hovered : collapsed);
	const irisVersion = $derived(userCtx.ctx?.iris_version ?? '');

	const toggleCollapsed = () => {
		// Optimistically flip via the context; it persists in the
		// background and rolls back on failure.
		void userCtx.setPreference('has_mini_sidebar', !collapsed);
	};
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
			<MenuIcon class="size-5 cursor-pointer" onclick={toggleCollapsed} />
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

		<!--
		  Running IRIS version. Pinned to the bottom of the scroll
		  viewport so it sits under the menu when content is short,
		  and stays accessible (still scrolls into view) when the nav
		  is taller than the viewport. Hidden in collapsed mode — the
		  rail is too narrow for a legible version string and the
		  user can already hover to expand.
		-->
		{#if !isCollapsed() && irisVersion}
			<div
				class="mt-auto border-t border-[hsl(var(--sidebar-border))] py-2 text-center text-2xs text-sidebar-foreground/50"
				title={`Running IRIS ${irisVersion}`}
			>
				IRIS {irisVersion}
			</div>
		{/if}
	</div>
</div>

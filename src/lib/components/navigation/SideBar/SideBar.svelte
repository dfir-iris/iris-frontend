<script lang="ts">
	import { MenuIcon } from 'lucide-svelte';
	import { UserMenu, SideNav } from '.';

	let collapsed = false;
</script>

<div class="sticky top-0 flex flex-col">
	<div
		class={`flex max-h-16 min-h-16 justify-center bg-primary-gradient p-4 drop-shadow-lg transition-all ${
			collapsed ? 'min-w-0' : 'w-full min-w-64 justify-between'
		}`}
	>
		{#if !collapsed}
			<img src="/img/logo/logo-white.png" alt="IRIS Logo" class="mx-4 h-7" />
		{/if}

		<div class="mx-1 flex justify-center text-gray-100 transition-all hover:opacity-80">
			<MenuIcon class="size-7 cursor-pointer" onclick={() => (collapsed = !collapsed)} />
		</div>
	</div>

	<div class="flex flex-col overflow-y-auto px-4">
		<div class="border-b border-b-gray-200 p-2">
			<UserMenu {collapsed} />
		</div>

		<div class="flex w-full p-2">
			<SideNav {collapsed} />
		</div>
	</div>
</div>

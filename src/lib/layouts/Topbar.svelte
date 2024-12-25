<script>
	import {
		BellIcon,
		ClipboardList,
		LogOutIcon,
		MoonIcon,
		SearchIcon,
		SettingsIcon,
		SlidersHorizontalIcon,
		SunIcon,
		UserRoundIcon
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/button/button.svelte';
	import Input from '$lib/components/ui/input/input.svelte';
	import {
		DropdownMenu,
		DropdownMenuLabel,
		DropdownMenuContent,
		DropdownMenuTrigger,
		DropdownMenuItem,
		DropdownMenuSeparator
	} from '$lib/components/ui/dropdown-menu';
	import { authUserStore } from '$lib/stores/auth.store';
	import { mode, toggleMode } from 'mode-watcher';
</script>

<header
	class="sticky top-0 flex h-12 shrink-0 flex-row items-center bg-primary-gradient px-4 shadow"
>
	<!-- Logo -->
	<a href="/" class="ml-1">
		<img
			src="/logo/logo-white-alone.png"
			alt="IRIS Logo"
			class="mr-4 w-[30px] transition-all duration-300"
		/>
	</a>
	<nav class="flex items-center text-white">
		<Button variant="link" href="/">Dashboard</Button>
		<Button variant="link" href="/cases">Cases</Button>
		<Button variant="link" href="/alerts">Alerts</Button>
	</nav>
	<div class="ml-auto"></div>

	<!-- Search bar -->
	<div class="group relative pr-2">
		<Input type="text" placeholder="Search" class="bg-background pl-8"></Input>
		<SearchIcon size={20} class="absolute left-2 top-2 opacity-70 group-focus-within:opacity-100" />
	</div>

	<!-- Tasks dropdown -->
	<DropdownMenu>
		<DropdownMenuTrigger asChild let:builder>
			<Button builders={[builder]} variant="ghost" class="px-2 text-gray-100"
				><ClipboardList /></Button
			>
		</DropdownMenuTrigger>
		<DropdownMenuContent class="w-56">
			<DropdownMenuLabel>Tasks</DropdownMenuLabel>

			<DropdownMenuSeparator />
			<DropdownMenuItem href="/tasks">
				<span>View all</span>
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>

	<!-- Alerts dropdown -->
	<DropdownMenu>
		<DropdownMenuTrigger asChild let:builder>
			<Button builders={[builder]} variant="ghost" class="px-2 text-gray-100"><BellIcon /></Button>
		</DropdownMenuTrigger>
		<DropdownMenuContent class="w-56">
			<DropdownMenuLabel>Alerts</DropdownMenuLabel>

			<DropdownMenuSeparator />
			<DropdownMenuItem href="/alerts">
				<span>View all</span>
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>

	<!-- User dropdown -->
	<DropdownMenu>
		<DropdownMenuTrigger asChild let:builder>
			<Button builders={[builder]} variant="ghost" class="px-2 text-gray-100"
				><UserRoundIcon /></Button
			>
		</DropdownMenuTrigger>
		<DropdownMenuContent class="w-56">
			<DropdownMenuLabel>{$authUserStore?.name || 'My account'}</DropdownMenuLabel>
			<DropdownMenuItem>
				<SlidersHorizontalIcon size={18} />
				<span>Preferences</span>
			</DropdownMenuItem>
			<DropdownMenuItem on:click={toggleMode}>
				{#if $mode == 'light'}
					<MoonIcon size={18} />
					<span>Dark mode</span>
				{:else}
					<SunIcon size={18} />
					<span>Light mode</span>
				{/if}
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem>
				<SettingsIcon size={18} />
				<span>Manage IRIS</span>
			</DropdownMenuItem>
			<DropdownMenuSeparator />
			<DropdownMenuItem>
				<LogOutIcon size={18} />
				<span>Log out</span>
			</DropdownMenuItem>
		</DropdownMenuContent>
	</DropdownMenu>
</header>

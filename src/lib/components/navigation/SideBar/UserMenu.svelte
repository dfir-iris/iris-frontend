<script lang="ts">
	import { page } from '$app/stores';
	import { username } from '$lib/stores/auth.store';
	import { mode, toggleMode } from 'mode-watcher';
	import {
		ChevronDownIcon,
		LogOutIcon,
		MoonIcon,
		SettingsIcon,
		SlidersHorizontalIcon,
		SunIcon
	} from 'lucide-svelte';
	import { AuthService } from '$lib/services/auth.service';
	import MenuItem from './MenuItem.svelte';

	export let collapsed;

	let minimized = true;

	$: pathname = $page.url.pathname;
	$: hash = $page.url.hash;

	const logout = () => {
		console.log('Logging out...');

		AuthService.logout();
	};
</script>

<div class={`flex w-full flex-col ${collapsed ? 'max-w-32' : 'max-w-auto'}`}>
	<button
		class="flex w-full cursor-pointer justify-center"
		on:click={() => (minimized = !minimized)}
	>
		<img src="/img/profile.jpg" alt="Avatar" class="flex h-10 w-10 rounded-full" />

		<div
			class={`flex w-full items-center justify-between overflow-hidden transition-all ${collapsed ? 'ml-0 max-w-0' : 'ml-2 max-w-96'}`}
		>
			<div class="flex w-full flex-col items-start justify-center">
				<span class="text-xs font-bold">{$username}</span>
				<span class="whitespace-nowrap text-2xs font-light text-gray-400"
					>{new Date().toLocaleString()}</span
				>
			</div>

			<div class={`flex font-bold transition-all ${!minimized ? 'rotate-180' : ''}`}>
				<ChevronDownIcon />
			</div>
		</div>
	</button>

	<ul
		class={`flex h-auto w-full flex-col items-center overflow-hidden text-gray-600 transition-all dark:text-gray-200 ${minimized ? 'max-h-0' : 'max-h-96'} ${collapsed ? 'pl-2.5' : 'pl-1'}`}
	>
		<MenuItem
			{collapsed}
			label="Preferences"
			icon={SlidersHorizontalIcon}
			href="/settings/#preferences"
			liClass="mt-4"
			active={pathname === '/settings' && hash === '#preferences'}
		/>

		{#if $mode === 'light'}
			<MenuItem {collapsed} label="Light mode" icon={SunIcon} onClick={() => toggleMode()} />
		{:else}
			<MenuItem {collapsed} label="Dark mode" icon={MoonIcon} onClick={() => toggleMode()} />
		{/if}

		<MenuItem
			{collapsed}
			label="Manage IRIS"
			icon={SettingsIcon}
			href="/settings"
			active={pathname === '/settings' && hash === ''}
		/>
		<MenuItem {collapsed} label="Log Out" icon={LogOutIcon} onClick={() => logout()} />
	</ul>
</div>

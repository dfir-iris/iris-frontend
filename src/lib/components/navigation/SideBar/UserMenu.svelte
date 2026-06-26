<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { auth, current_user, username } from '$lib/stores/auth.store';
	import { mode, toggleMode } from 'mode-watcher';
	import { LogOutIcon, MoonIcon, SlidersHorizontalIcon, SunIcon } from 'lucide-svelte';
	import { AuthService } from '$lib/services/auth.service';
	import UserAvatar from '$lib/components/common/UserAvatar.svelte';
	import MenuItem from './MenuItem.svelte';
	import SubMenu from './SubMenu.svelte';

	type Props = {
		collapsed: boolean;
	};

	let { collapsed }: Props = $props();

	const pathname = $derived(page.url.pathname);
	const hash = $derived(page.url.hash);

	let didLoadAuth = false;

	$effect(() => {
		if (!browser) return;
		if (didLoadAuth) return;
		didLoadAuth = true;

		void auth.loadAuth(fetch, false);
	});

	const logout = () => {
		console.log('Logging out...');

		AuthService.logout();
	};
</script>

<SubMenu {collapsed}>
	<svelte:fragment slot="trigger">
		<UserAvatar
			userId={$current_user?.user_id ?? $current_user?.id}
			name={$username === 'Loading...' ? null : $username}
			size="size-10"
		/>

		<div
			class={`flex w-full items-center justify-between overflow-hidden transition-all ${collapsed ? 'ml-0 max-w-0' : 'ml-2 max-w-96'}`}
		>
			<div class="flex w-full flex-col items-start justify-center">
				<span class="text-[13px] font-semibold text-foreground">{$username}</span>
				<span class="whitespace-nowrap text-2xs font-normal text-muted-foreground"
					>{new Date().toLocaleString()}</span
				>
			</div>
		</div>
	</svelte:fragment>

	<svelte:fragment slot="menu">
		<MenuItem
			{collapsed}
			label="My profile"
			icon={SlidersHorizontalIcon}
			href="/profile"
			liClass="mt-4"
			active={pathname === '/profile'}
		/>

		{#if $mode === 'light'}
			<MenuItem {collapsed} label="Light mode" icon={SunIcon} onClick={() => toggleMode()} />
		{:else}
			<MenuItem {collapsed} label="Dark mode" icon={MoonIcon} onClick={() => toggleMode()} />
		{/if}

		<MenuItem {collapsed} label="Log Out" icon={LogOutIcon} onClick={() => logout()} />
	</svelte:fragment>
</SubMenu>

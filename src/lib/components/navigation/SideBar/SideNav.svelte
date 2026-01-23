<script lang="ts">
	import { page } from '$app/stores';

	import {
		BellIcon,
		FileTextIcon,
		FolderIcon,
		InfoIcon,
		LayoutDashboardIcon,
		ScaleIcon,
		SearchIcon,
		UsersIcon
	} from 'lucide-svelte';

	import MenuItem from './MenuItem.svelte';

	export let collapsed: boolean;

	$: pathname = $page.url.pathname;
	$: hash = $page.url.hash;
</script>

<ul
	class={`flex h-auto w-full flex-col items-center overflow-hidden text-gray-600 transition-all dark:text-gray-200`}
>
	<MenuItem
		{collapsed}
		label="Dashboard"
		icon={LayoutDashboardIcon}
		href="/"
		liClass="mt-4"
		active={pathname === '/' && hash === ''}
	/>

	<MenuItem
		{collapsed}
		liClass="my-2"
		label="Activities"
		icon={FileTextIcon}
		href="/#activities"
		active={pathname === '/' && hash === '#activities'}
	/>

	<li class="my-4 ml-4 flex w-full text-sm uppercase text-gray-400">
		{#if collapsed}
			&nbsp;
		{:else}
			Investigation
		{/if}
	</li>

	<MenuItem
		{collapsed}
		label="Cases"
		icon={ScaleIcon}
		href="/#cases"
		active={pathname === '/' && hash === '#cases'}
	/>

	<MenuItem
		{collapsed}
		label="Alerts"
		icon={BellIcon}
		href="/#alerts"
		active={pathname === '/' && hash === '#alerts'}
	/>

	<MenuItem
		{collapsed}
		label="Customers"
		icon={UsersIcon}
		href="/#customers"
		active={pathname === '/' && hash === '#customers'}
	/>

	<MenuItem
		{collapsed}
		label="Search"
		icon={SearchIcon}
		href="/#search"
		active={pathname === '/' && hash === '#search'}
	/>

	<li class="my-4 ml-4 flex w-full text-sm uppercase text-gray-400">
		{#if collapsed}
			&nbsp;
		{:else}
			Manage
		{/if}
	</li>

	<MenuItem
		{collapsed}
		label="Manage Cases"
		icon={FolderIcon}
		href="/#manage"
		active={pathname === '/' && hash === '#manage'}
	/>

	<MenuItem
		{collapsed}
		label="Help"
		icon={InfoIcon}
		href="https://docs.dfir-iris.org/"
		target="_blank"
		active={false}
	/>
</ul>

<script lang="ts">
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

	export let collapsed;
</script>

<ul
	class={`flex h-auto flex-col items-center overflow-hidden text-gray-600 transition-all dark:text-gray-200 ${collapsed ? 'pl-2.5' : 'pl-1'}`}
>
	<MenuItem {collapsed} label="Dashboard" icon={LayoutDashboardIcon} href="/" liClass="mb-1 mt-4" />
	<MenuItem {collapsed} liClass="my-2" label="Activities" icon={FileTextIcon} href="/" />

	<li class="my-4 flex w-full text-sm uppercase text-gray-400">
		{#if collapsed}
			&nbsp;
		{:else}
			Investigation
		{/if}
	</li>

	<MenuItem {collapsed} liClass="my-2" label="Cases" icon={ScaleIcon} href="/#cases" />
	<MenuItem {collapsed} liClass="my-2" label="Alerts" icon={BellIcon} href="/alerts" />
	<MenuItem {collapsed} liClass="my-2" label="Customers" icon={UsersIcon} href="/customers" />
	<MenuItem {collapsed} liClass="my-2" label="Search" icon={SearchIcon} href="/search" />

	<li class="my-4 flex w-full text-sm uppercase text-gray-400">
		{#if collapsed}
			&nbsp;
		{:else}
			Manage
		{/if}
	</li>

	<MenuItem {collapsed} liClass="my-2" label="Manage Cases" icon={FolderIcon} href="/#cases" />
	<MenuItem
		liClass="my-2"
		{collapsed}
		label="Help"
		icon={InfoIcon}
		href="https://docs.dfir-iris.org/"
		target="_blank"
	/>
</ul>

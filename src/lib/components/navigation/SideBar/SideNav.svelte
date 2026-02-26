<script lang="ts">
	import { getContext } from 'svelte';
	import {
		BellIcon,
		CircleUserIcon,
		DoorOpenIcon,
		FileStackIcon,
		FileTextIcon,
		FolderIcon,
		HouseIcon,
		InfoIcon,
		LayersIcon,
		LockKeyholeIcon,
		NewspaperIcon,
		SearchIcon,
		ServerIcon,
		SettingsIcon,
		SlidersVerticalIcon,
		SquareDashedIcon,
		ViewIcon,
		WaypointsIcon
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import { APP_CTX, type AppContext } from '$lib/contexts/app.context.svelte';
	import MenuItem from './MenuItem.svelte';
	import SubMenu from './SubMenu.svelte';

	type Props = {
		collapsed: boolean;
	};

	let { collapsed }: Props = $props();

	const app = getContext<AppContext>(APP_CTX);

	const currentCaseID = $derived(app.state.currentCaseID);
	const pathname = $derived(page.url.pathname);
	const hash = $derived(page.url.hash);

	const mainMenuItems = [
		{ label: 'Dashboard', path: '/', icon: HouseIcon },
		{ label: 'Overview', path: '/cases', icon: ViewIcon },
		{ label: 'Welcome page', path: '/', hash: '#welcome', icon: DoorOpenIcon }
	];

	const investigationMenuItems = $derived([
		{ label: 'Case', path: `/case/${currentCaseID}`, icon: WaypointsIcon },
		{ label: 'Alerts', path: '/alerts', hash: '', icon: BellIcon },
		{ label: 'Search', path: '/', hash: '#search', icon: SearchIcon },
		{ label: 'Activities', path: '/', hash: '#activities', icon: FileTextIcon },
		{ label: 'Dim Tasks', path: '/', hash: '#dim-tasks', icon: FileStackIcon }
	]);

	const advancedMenuItems = [
		{ label: 'Modules', path: '/', hash: '#modules', icon: ServerIcon },
		{ label: 'Customers', path: '/', hash: '#customers', icon: CircleUserIcon },
		{ label: 'Case Objects', path: '/', hash: '#case-objects', icon: LayersIcon },
		{ label: 'Custom Attributes', path: '/', hash: '#custom-attributes', icon: WaypointsIcon },
		{ label: 'Case Templates', path: '/', hash: '#case-templates', icon: SquareDashedIcon },
		{ label: 'Report Templates', path: '/', hash: '#report-templates', icon: NewspaperIcon },
		{ label: 'Access Control', path: '/', hash: '#access-control', icon: LockKeyholeIcon },
		{ label: 'Server Settings', path: '/settings', icon: SettingsIcon }
	];
</script>

<ul
	class={`flex h-auto w-full flex-col items-center overflow-hidden text-gray-600 transition-all dark:text-gray-200`}
>
	{#each mainMenuItems as item}
		<MenuItem
			{collapsed}
			label={item.label}
			icon={item.icon}
			href={`${item.path}${item.hash ?? ''}`}
			active={pathname === item.path && hash === (item.hash ?? '')}
		/>
	{/each}

	<li class="my-4 ml-4 flex w-full text-sm uppercase text-gray-400">
		{#if collapsed}
			&nbsp;
		{:else}
			Investigation
		{/if}
	</li>

	{#each investigationMenuItems as item}
		<MenuItem
			{collapsed}
			label={item.label}
			icon={item.icon}
			href={`${item.path}${item.hash ?? ''}`}
			active={pathname === item.path && hash === (item.hash ?? '')}
		/>
	{/each}

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

	<SubMenu {collapsed}>
		<svelte:fragment slot="trigger">
			<MenuItem {collapsed} label="Advanced" icon={SlidersVerticalIcon} />
		</svelte:fragment>

		<svelte:fragment slot="menu">
			{#each advancedMenuItems as item}
				<MenuItem
					{collapsed}
					label={item.label}
					icon={item.icon}
					href={`${item.path}${item.hash ?? ''}`}
					active={pathname === item.path && hash === (item.hash ?? '')}
				/>
			{/each}
		</svelte:fragment>
	</SubMenu>

	<MenuItem
		{collapsed}
		label="Help"
		icon={InfoIcon}
		href="https://docs.dfir-iris.org/"
		target="_blank"
		active={false}
	/>
</ul>

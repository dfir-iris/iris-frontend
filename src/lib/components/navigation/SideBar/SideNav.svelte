<script lang="ts">
	import { getContext } from 'svelte';
	import {
		BellIcon,
		DoorOpenIcon,
		FileStackIcon,
		FileTextIcon,
		FolderIcon,
		HouseIcon,
		LayoutDashboardIcon,
		InfoIcon,
		SearchIcon,
		SettingsIcon,
		ShieldAlert,
		ViewIcon,
		WaypointsIcon
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import { APP_CTX, type AppContext } from '$lib/contexts/app.context.svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import type { PermissionName } from '$lib/services/user-context.service';
	import MenuItem from './MenuItem.svelte';

	type Props = {
		collapsed: boolean;
	};

	let { collapsed }: Props = $props();

	const app = getContext<AppContext>(APP_CTX);
	const userCtx = getContext<UserCtx>(USER_CTX);

	const currentCaseID = $derived(app.state.currentCaseID);
	const pathname = $derived(page.url.pathname);
	const hash = $derived(page.url.hash);

	type NavItem = {
		label: string;
		path: string;
		hash?: string;
		icon: typeof HouseIcon;
		matchPrefix?: boolean;
		/**
		 * Permission(s) required for the item to appear. `any` means the
		 * user only needs one of them — used for groups like
		 * "Activities" (read your own OR read all). Items with no
		 * permission gate (e.g. Home) are always visible.
		 */
		requires?: PermissionName | PermissionName[];
		/** When true, only visible while the server runs in demo mode. */
		demoOnly?: boolean;
	};

	const mainMenuItems: NavItem[] = [
		{ label: 'Home', path: '/', icon: HouseIcon },
		{
			label: 'Dashboards',
			path: '/dashboards',
			icon: LayoutDashboardIcon,
			matchPrefix: true,
			requires: 'custom_dashboards_read'
		},
		{ label: 'Overview', path: '/cases', icon: ViewIcon },
		{ label: 'Welcome page', path: '/welcome', icon: DoorOpenIcon, demoOnly: true }
	];

	// `matchPrefix: true` flags items that should light up for any nested
	// route under their `path`. The "Case" item is the natural example —
	// the user is still inside the case context whether they're on
	// `/case/42`, `/case/42/notes`, `/case/42/timeline`, etc.
	const investigationMenuItems = $derived<NavItem[]>([
		{ label: 'Case', path: `/case/${currentCaseID}`, icon: WaypointsIcon, matchPrefix: true },
		{
			label: 'Alerts',
			path: '/alerts',
			hash: '',
			icon: BellIcon,
			matchPrefix: true,
			requires: 'alerts_read'
		},
		{
			label: 'Search',
			path: '/search',
			icon: SearchIcon,
			requires: 'search_across_cases'
		},
		{
			label: 'Activities',
			path: '/activities',
			icon: FileTextIcon,
			requires: ['activities_read', 'all_activities_read']
		},
		{ label: 'Dim Tasks', path: '/dim-tasks', icon: FileStackIcon },
		{
			label: 'War Rooms',
			path: '/war-rooms',
			icon: ShieldAlert,
			matchPrefix: true,
			requires: 'war_rooms_read'
		}
	]);

	/**
	 * Filter the nav list against the loaded permission set. While the
	 * context is still loading (`ready === false`) we hide gated items
	 * to avoid a flash of menu entries the user can't actually use —
	 * Home and the Manage section keep the side bar from looking empty.
	 */
	function visible(items: NavItem[]): NavItem[] {
		return items.filter((item) => {
			if (item.demoOnly && !userCtx.ctx?.demo_mode) return false;
			if (!item.requires) return true;
			if (!userCtx.ready) return false;
			if (Array.isArray(item.requires)) return userCtx.canAny(item.requires);
			return userCtx.can(item.requires);
		});
	}

	const visibleMain = $derived(visible(mainMenuItems));
	const visibleInvestigation = $derived(visible(investigationMenuItems));
	const showInvestigationGroup = $derived(visibleInvestigation.length > 0);
	const canManageCustomers = $derived(userCtx.can('customers_read'));
	const canManageCaseTemplates = $derived(userCtx.can('case_templates_read'));
	const canManageServer = $derived(userCtx.can('server_administrator'));
	const showManageGroup = $derived(
		canManageCustomers || canManageCaseTemplates || canManageServer || !userCtx.ready
	);

	const isItemActive = (item: { path: string; hash?: string; matchPrefix?: boolean }) => {
		const itemHash = item.hash ?? '';
		if (item.matchPrefix) {
			// Prefix match the path (so /case/42/notes still highlights "Case"
			// and /alerts/123 highlights "Alerts"). Hash, if specified, must
			// still match exactly so a single base path with multiple hash-
			// scoped items stays unambiguous.
			const pathOk = pathname === item.path || pathname.startsWith(`${item.path}/`);
			return pathOk && hash === itemHash;
		}
		return pathname === item.path && hash === itemHash;
	};

</script>

<ul
	class={`flex h-auto w-full flex-col items-center overflow-hidden text-sidebar-foreground transition-all`}
>
	{#each visibleMain as item (item.path)}
		<MenuItem
			{collapsed}
			label={item.label}
			icon={item.icon}
			href={`${item.path}${item.hash ?? ''}`}
			active={isItemActive(item)}
		/>
	{/each}

	{#if showInvestigationGroup}
		<li class="my-4 ml-4 flex w-full text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
			{#if collapsed}
				&nbsp;
			{:else}
				Investigation
			{/if}
		</li>

		{#each visibleInvestigation as item (item.path)}
			<MenuItem
				{collapsed}
				label={item.label}
				icon={item.icon}
				href={`${item.path}${item.hash ?? ''}`}
				active={isItemActive(item)}
			/>
		{/each}
	{/if}

	{#if showManageGroup}
		<li class="my-4 ml-4 flex w-full text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50">
			{#if collapsed}
				&nbsp;
			{:else}
				Manage
			{/if}
		</li>

		{#if canManageCustomers || canManageCaseTemplates || !userCtx.ready}
			<MenuItem
				{collapsed}
				label="Manage Cases"
				icon={FolderIcon}
				href="/manage/cases"
				active={pathname === '/manage/cases' || pathname.startsWith('/manage/cases/')}
			/>
		{/if}

		{#if canManageServer}
			<MenuItem
				{collapsed}
				label="Settings"
				icon={SettingsIcon}
				href="/settings"
				active={pathname === '/settings' || pathname.startsWith('/settings/')}
			/>
		{/if}
	{/if}

	<MenuItem
		{collapsed}
		label="Help"
		icon={InfoIcon}
		href="https://docs.dfir-iris.org/"
		target="_blank"
		active={false}
	/>
</ul>

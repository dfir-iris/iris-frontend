<script lang="ts">
	import { getContext } from 'svelte';
	import {
		BellIcon,
		BookOpenIcon,
		ChevronDownIcon,
		ComputerIcon,
		DoorOpenIcon,
		FileStackIcon,
		FileTextIcon,
		FolderIcon,
		HouseIcon,
		LayoutDashboardIcon,
		LayersIcon,
		LightbulbIcon,
		InfoIcon,
		SearchIcon,
		SettingsIcon,
		ShieldAlert,
		ShieldHalfIcon,
		ViewIcon,
		WaypointsIcon
	} from 'lucide-svelte';
	import { page } from '$app/state';
	import { APP_CTX, type AppContext } from '$lib/contexts/app.context.svelte';
	import { USER_CTX, type UserCtx } from '$lib/contexts/user-context.context.svelte';
	import type { PermissionName } from '$lib/services/user-context.service';
	import { canReadVulnerabilities as canReadVulnerabilitiesGate } from '$lib/components/vulnerabilities/permissions';
	import { aiSuggestionsEnabled } from '$lib/stores/ai-suggestions.store.svelte';
	import MenuItem from './MenuItem.svelte';
	import { SETTINGS_PERMISSIONS, visibleSettingsPages } from '../settings-pages';

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
		/** When false, hidden whatever the permissions (a feature turned off). */
		enabled?: boolean;
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
			label: 'Alert Clusters',
			path: '/alert-clusters',
			icon: LayersIcon,
			matchPrefix: true,
			requires: 'alert_clusters_read'
		},
		{
			label: 'War Rooms',
			path: '/war-rooms',
			icon: ShieldAlert,
			matchPrefix: true,
			requires: 'war_rooms_read'
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
		{
			label: 'AI Suggestions',
			path: '/suggestions',
			icon: LightbulbIcon,
			enabled: aiSuggestionsEnabled()
		},
		{ label: 'Dim Tasks', path: '/dim-tasks', icon: FileStackIcon }
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
			if (item.enabled === false) return false;
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
	// Settings hosts pages gated on different permissions (customers,
	// case templates, clustering rules, …), not just server admin.
	const canOpenSettings = $derived(userCtx.canAny(SETTINGS_PERMISSIONS));
	const canManageAssets = $derived(userCtx.can('asset_manager_read'));
	const canReadVulnerabilities = $derived(canReadVulnerabilitiesGate(userCtx));

	// Settings is a group: its pages are listed under it rather than in a
	// second menu inside the page. The entry itself opens the first page
	// the user can see. The group unfolds whenever a settings page is
	// open; the chevron folds it away without navigating.
	const settingsPages = $derived(visibleSettingsPages(userCtx.can, userCtx.ctx));
	const settingsHref = $derived(
		settingsPages.length ? `/settings${settingsPages[0].href}` : '/settings'
	);
	const inSettings = $derived(pathname === '/settings' || pathname.startsWith('/settings/'));
	let settingsOpen = $state(false);
	$effect(() => {
		if (inSettings) settingsOpen = true;
	});
	const isSettingsPageActive = (href: string) => {
		const target = `/settings${href}`;
		return pathname === target || pathname.startsWith(`${target}/`);
	};
	const showManageGroup = $derived(
		canManageCustomers ||
			canManageCaseTemplates ||
			canManageAssets ||
			canReadVulnerabilities ||
			canOpenSettings ||
			!userCtx.ready
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
		<li
			class="my-4 ml-4 flex w-full text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50"
		>
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
		<li
			class="my-4 ml-4 flex w-full text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50"
		>
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

		{#if canManageAssets}
			<MenuItem
				{collapsed}
				label="Assets"
				icon={ComputerIcon}
				href="/manage/assets"
				active={pathname === '/manage/assets' || pathname.startsWith('/manage/assets/')}
			/>
		{/if}

		{#if canReadVulnerabilities}
			<MenuItem
				{collapsed}
				label="Vulnerabilities"
				icon={ShieldHalfIcon}
				href="/manage/vulnerabilities"
				active={pathname === '/manage/vulnerabilities' ||
					pathname.startsWith('/manage/vulnerabilities/')}
			/>
		{/if}

		{#if canOpenSettings}
			{@const expanded = settingsOpen && !collapsed}
			<li class="relative w-full">
				<!--
				  Highlighted like any entry while the group is folded (or the
				  rail collapsed); once unfolded the active page below carries
				  the highlight instead.
				-->
				<ul>
					<MenuItem
						{collapsed}
						label="Settings"
						icon={SettingsIcon}
						href={settingsHref}
						active={inSettings && !expanded}
					/>
				</ul>
				{#if !collapsed}
					<button
						type="button"
						class="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-sidebar-foreground/60 hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground {inSettings &&
						!expanded
							? 'text-white/80 hover:text-white'
							: ''}"
						onclick={() => (settingsOpen = !settingsOpen)}
						aria-label={settingsOpen ? 'Hide settings pages' : 'Show settings pages'}
						aria-expanded={settingsOpen}
					>
						<ChevronDownIcon
							size={14}
							class="transition-transform {settingsOpen ? 'rotate-180' : ''}"
						/>
					</button>
				{/if}
			</li>

			{#if expanded}
				<li class="w-full">
					<ul
						class="ml-5 flex flex-col gap-0.5 border-l border-[hsl(var(--sidebar-border))] py-1 pl-2"
					>
						{#each settingsPages as item (item.href)}
							{@const active = isSettingsPageActive(item.href)}
							<li>
								<a
									href={`/settings${item.href}`}
									class="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors {active
										? 'bg-iris-blue font-medium text-white shadow-sm'
										: 'text-sidebar-foreground hover:bg-[hsl(var(--sidebar-hover))] hover:text-foreground'}"
									aria-current={active ? 'page' : undefined}
								>
									<item.icon size={14} class="shrink-0" />
									<span class="truncate">{item.label}</span>
								</a>
							</li>
						{/each}
					</ul>
				</li>
			{/if}
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
	<MenuItem
		{collapsed}
		label="API Docs"
		icon={BookOpenIcon}
		href="/api-docs"
		target="_blank"
		active={false}
	/>
</ul>

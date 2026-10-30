import {
	BellIcon,
	BookDashedIcon,
	CheckSquareIcon,
	CircleUserIcon,
	FilterIcon,
	FlagIcon,
	GraduationCapIcon,
	KeyRoundIcon,
	LayersIcon,
	ListChecksIcon,
	LockKeyholeIcon,
	MailIcon,
	MegaphoneIcon,
	NewspaperIcon,
	PlugIcon,
	ServerIcon,
	SettingsIcon,
	SparklesIcon,
	SplineIcon,
	WaypointsIcon,
	WebhookIcon,
	WorkflowIcon
} from 'lucide-svelte';
import type { Icon } from 'lucide-svelte';
import {
	demoHidesServerSettings,
	type PermissionName,
	type UserContext
} from '$lib/services/user-context.service';
import { runtimeConfig } from '$lib/stores/runtime-config.store.svelte';

export type SettingsGroup = 'Access' | 'Cases' | 'Alerts' | 'Integrations' | 'AI' | 'Platform';

export type SettingsPage = {
	icon: typeof Icon;
	label: string;
	href: string;
	group: SettingsGroup;
};

/**
 * Every Settings page in menu order, `href` relative to `/settings`.
 * Rendered as the Settings sub-menu of the side bar, one titled section
 * per `group` (pages of a group stay contiguous); `/settings` itself
 * opens the first one the user can see.
 */
export const SETTINGS_PAGES: SettingsPage[] = [
	{ icon: LockKeyholeIcon, label: 'Access control', href: '/access-control', group: 'Access' },
	{ icon: CircleUserIcon, label: 'Customers', href: '/customers', group: 'Access' },
	{ icon: BookDashedIcon, label: 'Case templates', href: '/case-templates', group: 'Cases' },
	{ icon: NewspaperIcon, label: 'Report templates', href: '/report-templates', group: 'Cases' },
	{ icon: LayersIcon, label: 'Case objects', href: '/case-objects', group: 'Cases' },
	{ icon: WaypointsIcon, label: 'Custom attributes', href: '/custom-attributes', group: 'Cases' },
	{ icon: FlagIcon, label: 'Asset flags', href: '/asset-flags', group: 'Cases' },
	{ icon: SplineIcon, label: 'Graph relations', href: '/graph-relations', group: 'Cases' },
	{ icon: ListChecksIcon, label: 'Tracker templates', href: '/tracker-templates', group: 'Cases' },
	{ icon: MailIcon, label: 'Mail ingest', href: '/mail', group: 'Alerts' },
	{ icon: FilterIcon, label: 'Clustering rules', href: '/cluster-rules', group: 'Alerts' },
	{
		icon: CheckSquareIcon,
		label: 'Investigation flows',
		href: '/investigation-flows',
		group: 'Alerts'
	},
	{ icon: ServerIcon, label: 'Modules', href: '/modules', group: 'Integrations' },
	{ icon: WebhookIcon, label: 'Webhooks', href: '/webhooks', group: 'Integrations' },
	{ icon: SparklesIcon, label: 'Chatbot', href: '/chatbot', group: 'AI' },
	{ icon: WorkflowIcon, label: 'Workflows', href: '/ai-workflows', group: 'AI' },
	{ icon: KeyRoundIcon, label: 'Keystore', href: '/keystore', group: 'AI' },
	{ icon: PlugIcon, label: 'MCP server', href: '/mcp', group: 'AI' },
	{ icon: BellIcon, label: 'Notifications', href: '/notifications', group: 'Platform' },
	{ icon: MegaphoneIcon, label: 'Banners', href: '/banners', group: 'Platform' },
	{ icon: GraduationCapIcon, label: 'Tutorials', href: '/tutorials', group: 'Platform' },
	{ icon: SettingsIcon, label: 'Server settings', href: '/server', group: 'Platform' }
];

/** Split pages into consecutive titled sections, dropping empty ones. */
export function groupSettingsPages(
	pages: SettingsPage[]
): { group: SettingsGroup; pages: SettingsPage[] }[] {
	const sections: { group: SettingsGroup; pages: SettingsPage[] }[] = [];
	for (const page of pages) {
		const last = sections.at(-1);
		if (last?.group === page.group) last.pages.push(page);
		else sections.push({ group: page.group, pages: [page] });
	}
	return sections;
}

/**
 * The Settings pages the user's permissions open — someone granted
 * just case templates sees just that entry. Server settings hold SMTP
 * credentials, DSNs and the backup trigger; a demo instance hands
 * every visitor an admin account, so that entry only stays for the
 * instance owner. The API enforces the same rules — this just avoids
 * offering links that 403.
 */
export function visibleSettingsPages(
	can: (perm: PermissionName) => boolean,
	ctx: UserContext | null
): SettingsPage[] {
	return SETTINGS_PAGES.filter((item) => {
		if (!can(SETTINGS_PAGE_PERMISSIONS[item.href])) return false;
		if (AI_WORKFLOW_PAGES.includes(item.href) && !runtimeConfig.aiWorkflowsEnabled) return false;
		return !(item.href === '/server' && demoHidesServerSettings(ctx));
	});
}

/** Pages that only exist when `AI_WORKFLOWS_ENABLED` is on (runtime config). */
export const AI_WORKFLOW_PAGES = ['/ai-workflows', '/keystore'];

/**
 * Permission each Settings page needs, keyed by its path under
 * `/settings`. Mirrors the `@ac_api_requires` gates on the backend
 * routes the page drives, so a user granted only part of the admin
 * surface (e.g. case templates) is offered exactly the pages they can
 * use. Shared by the side bar's Settings entry and the Settings
 * sub-menu so the two never disagree.
 */
export const SETTINGS_PAGE_PERMISSIONS: Record<string, PermissionName> = {
	'/modules': 'server_administrator',
	'/customers': 'customers_read',
	'/case-objects': 'server_administrator',
	'/asset-flags': 'server_administrator',
	'/graph-relations': 'server_administrator',
	'/tracker-templates': 'server_administrator',
	'/custom-attributes': 'server_administrator',
	'/case-templates': 'case_templates_read',
	'/report-templates': 'server_administrator',
	'/access-control': 'server_administrator',
	'/notifications': 'server_administrator',
	'/mail': 'server_administrator',
	'/webhooks': 'server_administrator',
	'/cluster-rules': 'cluster_rules_read',
	'/investigation-flows': 'investigation_flows_read',
	'/mcp': 'server_administrator',
	'/chatbot': 'server_administrator',
	'/ai-workflows': 'ai_workflows_read',
	'/keystore': 'ai_workflows_read',
	'/banners': 'server_administrator',
	'/tutorials': 'server_administrator',
	'/server': 'server_administrator'
};

/** Every permission that unlocks at least one Settings page. */
export const SETTINGS_PERMISSIONS: PermissionName[] = [
	...new Set(Object.values(SETTINGS_PAGE_PERMISSIONS))
];

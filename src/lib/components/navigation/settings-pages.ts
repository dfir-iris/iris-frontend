import {
	BellIcon,
	BookDashedIcon,
	CheckSquareIcon,
	CircleUserIcon,
	FilterIcon,
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
	WaypointsIcon,
	WebhookIcon
} from 'lucide-svelte';
import type { Icon } from 'lucide-svelte';
import {
	demoHidesServerSettings,
	type PermissionName,
	type UserContext
} from '$lib/services/user-context.service';

export type SettingsPage = { icon: typeof Icon; label: string; href: string };

/**
 * Every Settings page in menu order, `href` relative to `/settings`.
 * Rendered as the Settings sub-menu of the side bar; `/settings`
 * itself opens the first one the user can see.
 */
export const SETTINGS_PAGES: SettingsPage[] = [
	{ icon: ServerIcon, label: 'Modules', href: '/modules' },
	{ icon: CircleUserIcon, label: 'Customers', href: '/customers' },
	{ icon: LayersIcon, label: 'Case Objects', href: '/case-objects' },
	{ icon: ListChecksIcon, label: 'Asset stages', href: '/asset-stages' },
	{ icon: WaypointsIcon, label: 'Custom Attributes', href: '/custom-attributes' },
	{ icon: BookDashedIcon, label: 'Case Templates', href: '/case-templates' },
	{ icon: NewspaperIcon, label: 'Report Templates', href: '/report-templates' },
	{ icon: LockKeyholeIcon, label: 'Access Control', href: '/access-control' },
	{ icon: BellIcon, label: 'Notifications', href: '/notifications' },
	{ icon: MailIcon, label: 'Mail rules', href: '/mail' },
	{ icon: WebhookIcon, label: 'Webhooks', href: '/webhooks' },
	{ icon: FilterIcon, label: 'Clustering Rules', href: '/cluster-rules' },
	{ icon: CheckSquareIcon, label: 'Investigation flows', href: '/investigation-flows' },
	{ icon: PlugIcon, label: 'MCP Server', href: '/mcp' },
	{ icon: SparklesIcon, label: 'Chatbot', href: '/chatbot' },
	{ icon: MegaphoneIcon, label: 'Banners', href: '/banners' },
	{ icon: SettingsIcon, label: 'Server Settings', href: '/server' }
];

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
		return !(item.href === '/server' && demoHidesServerSettings(ctx));
	});
}

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
	'/asset-stages': 'server_administrator',
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
	'/banners': 'server_administrator',
	'/server': 'server_administrator'
};

/** Every permission that unlocks at least one Settings page. */
export const SETTINGS_PERMISSIONS: PermissionName[] = [
	...new Set(Object.values(SETTINGS_PAGE_PERMISSIONS))
];

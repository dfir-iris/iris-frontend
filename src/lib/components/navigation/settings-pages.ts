import type { PermissionName } from '$lib/services/user-context.service';

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
	'/custom-attributes': 'server_administrator',
	'/case-templates': 'case_templates_read',
	'/report-templates': 'server_administrator',
	'/access-control': 'server_administrator',
	'/notifications': 'server_administrator',
	'/mail': 'server_administrator',
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

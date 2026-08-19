/**
 * Compact bootstrap payload the SPA fetches once per session. Backs
 * onto `GET /api/v2/me/context` — exposes:
 *
 *   * `iris_version` — surfaced under the IRIS logo in the side bar.
 *   * `demo_mode`    — gates pages that only make sense on the demo
 *                      instance (e.g. the public Welcome page), and
 *                      hides what a demo instance locks down.
 *   * `user_id`      — the caller's own id. Paired with `demo_mode` to
 *                      keep the server settings reachable for the demo
 *                      instance owner only.
 *   * `permissions`  — both the raw bitmask and the resolved enum
 *                      names so the SPA can gate menu items / routes
 *                      without re-doing the math on every check.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

/**
 * Mirrors `Permissions` in `source/app/models/authorization.py`. The
 * values are bitmask flags — kept identical to the backend so a mask
 * round-trips cleanly. `standard_user` is implicit for any
 * authenticated user; the backend forces it on in the context payload
 * so the SPA doesn't need to special-case it.
 */
export const Permission = {
	standard_user: 0x1,
	server_administrator: 0x2,
	alerts_read: 0x4,
	alerts_write: 0x8,
	alerts_delete: 0x10,
	search_across_cases: 0x20,
	customers_read: 0x40,
	customers_write: 0x80,
	case_templates_read: 0x100,
	case_templates_write: 0x200,
	activities_read: 0x400,
	all_activities_read: 0x800,
	custom_dashboards_read: 0x1000,
	custom_dashboards_write: 0x2000,
	custom_dashboards_share: 0x4000,
	war_rooms_read: 0x8000,
	war_rooms_write: 0x10000,
	war_rooms_create: 0x20000,
	alert_clusters_read: 0x40000,
	alert_clusters_write: 0x80000,
	alert_clusters_delete: 0x100000,
	cluster_rules_read: 0x200000,
	cluster_rules_write: 0x400000,
	investigation_flows_read: 0x800000,
	investigation_flows_write: 0x1000000,
	asset_manager_read: 0x2000000,
	asset_manager_write: 0x4000000
} as const;

export type PermissionName = keyof typeof Permission;

export interface UserPreferences {
	has_mini_sidebar: boolean;
}

export interface UserContext {
	iris_version: string;
	demo_mode: boolean;
	user_id: number;
	permissions: {
		mask: number;
		names: PermissionName[];
	};
	preferences: UserPreferences;
}

export class UserContextService {
	static async get(options: ApiOptions = {}): Promise<RequestResponse<UserContext>> {
		return ApiService.get<UserContext>('/me/context', options);
	}

	static async updatePreferences(
		patch: Partial<UserPreferences>,
		options: ApiOptions = {}
	): Promise<RequestResponse<UserPreferences>> {
		return ApiService.put<UserPreferences>('/me/preferences', patch, options);
	}
}

export function hasPermission(ctx: UserContext | null, perm: PermissionName): boolean {
	if (!ctx) return false;
	const flag = Permission[perm];
	return (ctx.permissions.mask & flag) === flag;
}

export function hasAnyPermission(ctx: UserContext | null, perms: PermissionName[]): boolean {
	return perms.some((p) => hasPermission(ctx, p));
}

/**
 * The account that owns a demo instance — mirrors
 * `DEMO_MODE_OWNER_USER_ID` in `app/iris_engine/demo_builder.py`.
 */
export const DEMO_MODE_OWNER_USER_ID = 1;

/**
 * True when the caller must not see the server settings surface.
 * Mirrors `demo_mode_restricts_server_settings` on the API side — the
 * routes return 403 regardless, this only keeps the UI honest so nobody
 * is offered a page they'll bounce off.
 */
export function demoHidesServerSettings(ctx: UserContext | null): boolean {
	return !!ctx?.demo_mode && ctx.user_id !== DEMO_MODE_OWNER_USER_ID;
}

/**
 * True when credentials are frozen. Demo accounts are shared and their
 * passwords are published, so nobody — not even an admin editing
 * another account — may change a password or enrol a second factor.
 * Mirrors `demo_mode_blocks_password_change` / `demo_mode_blocks_mfa`,
 * which are both simply "demo mode is on".
 */
export function demoLocksCredentials(ctx: UserContext | null): boolean {
	return !!ctx?.demo_mode;
}

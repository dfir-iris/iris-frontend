/**
 * Compact bootstrap payload the SPA fetches once per session. Backs
 * onto `GET /api/v2/me/context` — exposes:
 *
 *   * `iris_version` — surfaced under the IRIS logo in the side bar.
 *   * `demo_mode`    — gates pages that only make sense on the demo
 *                      instance (e.g. the public Welcome page).
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
	custom_dashboards_share: 0x4000
} as const;

export type PermissionName = keyof typeof Permission;

export interface UserContext {
	iris_version: string;
	demo_mode: boolean;
	permissions: {
		mask: number;
		names: PermissionName[];
	};
}

export class UserContextService {
	static async get(options: ApiOptions = {}): Promise<RequestResponse<UserContext>> {
		return ApiService.get<UserContext>('/me/context', options);
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

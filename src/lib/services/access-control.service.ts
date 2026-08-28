/**
 * v2 service for the Settings Access Control page.
 *
 * Every legacy /manage/* path has been migrated to v2; this service
 * is now a plain wrapper over `/api/v2/manage/users`,
 * `/api/v2/manage/groups`, and `/api/v2/manage/access-control` with
 * no proxy magic needed.
 */
import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';

// ---- v2 shapes -------------------------------------------------------

export interface AccessControlGroupRef {
	group_id: number;
	group_name: string;
	group_uuid?: string;
}

export interface AccessControlPermissionRef {
	group_name: string;
	group_permissions: number;
}

export interface AccessControlCustomerRef {
	customer_id: number;
	customer_name: string;
}

export interface AccessControlCaseAccessEntry {
	case_id: number;
	case_name?: string;
	access_level: number;
}

/** Mirrors the backend `CaseAccessLevel` enum. */
export enum AccessLevel {
	DENY_ALL = 0x1,
	READ_ONLY = 0x2,
	FULL_ACCESS = 0x4
}

export interface AccessControlUser {
	user_id: number;
	user_name: string;
	user_login: string;
	user_email: string;
	user_active: boolean;
	user_is_service_account?: boolean;
	user_isadmin?: boolean;
	user_api_key?: string;
	user_groups?: AccessControlGroupRef[];
	user_permissions?: AccessControlPermissionRef[];
	user_customers?: AccessControlCustomerRef[];
	user_cases_access?: AccessControlCaseAccessEntry[];
	user_organisations?: unknown[];
	user_primary_organisation_id?: number | null;
	/**
	 * Set by the API on a demo instance for the seeded accounts (and the
	 * instance owner). Those accounts are shared between visitors and
	 * their credentials are published on the landing page, so the API
	 * refuses every write against them — mirrors `protect_demo_mode_user`
	 * in `app/iris_engine/demo_builder.py`. Always false otherwise.
	 */
	user_is_demo_protected?: boolean;
	[key: string]: unknown;
}

export interface AccessControlGroupMember {
	id: number;
	user: string;
	name: string;
}

export interface AccessControlGroup {
	group_id: number;
	group_uuid: string;
	group_name: string;
	group_description: string;
	group_permissions: number;
	group_permissions_list?: Array<{ name: string; value: number }>;
	group_members?: AccessControlGroupMember[];
	group_auto_follow?: boolean;
	group_auto_follow_access_level?: number;
	group_cases_access?: AccessControlCaseAccessEntry[];
	/**
	 * Set by the API on a demo instance for the seeded groups — they
	 * carry the permissions every demo account inherits, so the API
	 * refuses every write against them. Mirrors
	 * `protect_demo_mode_group`. Always false otherwise.
	 */
	group_is_demo_protected?: boolean;
}

export interface SearchParams {
	page?: number;
	per_page?: number;
	search?: string;
}

export interface CreateUserBody {
	user_name: string;
	user_login: string;
	user_email: string;
	user_password?: string;
	user_active?: boolean;
	user_isadmin?: boolean;
	user_is_service_account?: boolean;
}

export type UpdateUserBody = Partial<CreateUserBody>;

export interface CreateGroupBody {
	group_name: string;
	group_description?: string;
	group_permissions: number;
}

export type UpdateGroupBody = Partial<CreateGroupBody>;

export interface PermissionDescriptor {
	name: string;
	value: number;
	label: string;
	description: string;
}

export interface CaseAccessLevelDescriptor {
	name: string;
	value: number;
	label: string;
	description: string;
}

export interface AccessControlSchemaInfo {
	permissions: PermissionDescriptor[];
	case_access_levels: CaseAccessLevelDescriptor[];
}

export interface AccessibleCaseSummary {
	case_id: number;
	name: string;
	soc_id: string | null;
}

/**
 * Per-case effective access trace. Surfaced as the values of
 * `access_audit` (a dict keyed by case_id on the wire — the page
 * maps it to an array for rendering).
 *
 *   `user_access`            — every grant that touched this case
 *                              for this user, ordered loosely by
 *                              source (default → group → customer →
 *                              direct user); each row carries a
 *                              `state` saying whether it was applied
 *                              ("Effective") or overridden.
 *   `user_effective_access`  — the resolved list of permissions
 *                              (e.g. `["read_only"]`).
 */
export interface UserAuditAccessSource {
	state: string;
	access_list: string | string[];
	access_value: number;
	inherited_from: {
		object_type: string;
		object_name: string;
		object_id: number | string;
		object_uuid: string;
	};
}

export interface UserAuditAccessEntry {
	case_info: { case_id: number; case_name: string };
	user_access: UserAuditAccessSource[];
	user_effective_access: string[];
}

/**
 * Per-permission trace. Surfaced as the values of
 * `permissions_audit.details` (a dict keyed by the permission's bit
 * value).
 *
 *   `name`          — enum name on `Permissions` (e.g. `alerts_read`).
 *   `value`         — bit value (e.g. 4 for `alerts_read`).
 *   `inherited_from` — every group that contributes this bit, keyed
 *                       by group_id.
 */
export interface UserAuditPermissionDetail {
	name: string;
	value: number;
	inherited_from: Record<string, { group_name: string; group_uuid: string }>;
}

export interface UserAudit {
	access_audit: Record<string, UserAuditAccessEntry>;
	permissions_audit: {
		details: Record<string, UserAuditPermissionDetail>;
		effective: number;
	};
}

// ---- Service ---------------------------------------------------------

export class AccessControlService {
	// ----- Users ------------------------------------------------------
	static async searchUsers(
		params: SearchParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<AccessControlUser>>> {
		return ApiService.get<Paginated<AccessControlUser>>(
			ApiService.withQuery('/manage/users', params as Record<string, unknown>),
			options
		);
	}

	static async getUser(
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlUser>> {
		return ApiService.get<AccessControlUser>(`/manage/users/${userId}`, options);
	}

	static async createUser(
		body: CreateUserBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlUser>> {
		return ApiService.post<AccessControlUser>('/manage/users', body, options);
	}

	static async updateUser(
		userId: number,
		body: UpdateUserBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlUser>> {
		return ApiService.put<AccessControlUser>(`/manage/users/${userId}`, body, options);
	}

	static async deleteUser(
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/manage/users/${userId}`, options);
	}

	static async activateUser(
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlUser>> {
		return ApiService.post<AccessControlUser>(`/manage/users/${userId}/activate`, {}, options);
	}

	static async deactivateUser(
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlUser>> {
		return ApiService.post<AccessControlUser>(`/manage/users/${userId}/deactivate`, {}, options);
	}

	/**
	 * Rotates the user's API key. The new key is included in the
	 * response only once — the page must surface it immediately
	 * because subsequent reads only return a redacted placeholder.
	 */
	static async renewUserApiKey(
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ user_id: number; user: string; api_key: string }>> {
		return ApiService.post<{ user_id: number; user: string; api_key: string }>(
			`/manage/users/${userId}/api-key/renew`,
			{},
			options
		);
	}

	static async resetUserMfa(
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message: string }>> {
		return ApiService.post<{ message: string }>(`/manage/users/${userId}/mfa/reset`, {}, options);
	}

	static async recomputeUserAccess(
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message: string }>> {
		return ApiService.post<{ message: string }>(
			`/manage/users/${userId}/recompute-access`,
			{},
			options
		);
	}

	static async auditUser(
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<UserAudit>> {
		return ApiService.get<UserAudit>(`/manage/users/${userId}/audit`, options);
	}

	// User → groups
	static async getUserGroups(
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ data: AccessControlGroupRef[] }>> {
		return ApiService.get<{ data: AccessControlGroupRef[] }>(
			`/manage/users/${userId}/groups`,
			options
		);
	}

	static async setUserGroups(
		userId: number,
		groups: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlUser>> {
		return ApiService.put<AccessControlUser>(`/manage/users/${userId}/groups`, { groups }, options);
	}

	// User → customers
	static async setUserCustomers(
		userId: number,
		customers: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlUser>> {
		return ApiService.put<AccessControlUser>(
			`/manage/users/${userId}/customers`,
			{ customers },
			options
		);
	}

	// User → case access
	static async setUserCasesAccess(
		userId: number,
		cases_list: number[],
		access_level: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlUser>> {
		return ApiService.post<AccessControlUser>(
			`/manage/users/${userId}/cases-access`,
			{ cases_list, access_level },
			options
		);
	}

	/**
	 * `DELETE` with a JSON body — `ApiService.delete` doesn't accept
	 * one, so this method falls back to a hand-written fetch that
	 * threads through the same auth + base-URL setup.
	 *
	 * Used by both the per-user and per-group case-access removals.
	 */
	static async deleteUserCasesAccessWithBody(
		userId: number,
		cases: number[]
	): Promise<RequestResponse<AccessControlUser>> {
		return jsonDelete<AccessControlUser>(`/api/v2/manage/users/${userId}/cases-access`, { cases });
	}

	// ----- Groups -----------------------------------------------------
	static async searchGroups(
		params: SearchParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<AccessControlGroup>>> {
		return ApiService.get<Paginated<AccessControlGroup>>(
			ApiService.withQuery('/manage/groups', params as Record<string, unknown>),
			options
		);
	}

	static async getGroup(
		groupId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlGroup>> {
		return ApiService.get<AccessControlGroup>(`/manage/groups/${groupId}`, options);
	}

	static async createGroup(
		body: CreateGroupBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlGroup>> {
		return ApiService.post<AccessControlGroup>('/manage/groups', body, options);
	}

	static async updateGroup(
		groupId: number,
		body: UpdateGroupBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlGroup>> {
		return ApiService.put<AccessControlGroup>(`/manage/groups/${groupId}`, body, options);
	}

	static async deleteGroup(
		groupId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/manage/groups/${groupId}`, options);
	}

	// Group → members
	static async getGroupMembers(
		groupId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ data: AccessControlGroupMember[] }>> {
		return ApiService.get<{ data: AccessControlGroupMember[] }>(
			`/manage/groups/${groupId}/members`,
			options
		);
	}

	static async setGroupMembers(
		groupId: number,
		members: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlGroup>> {
		return ApiService.put<AccessControlGroup>(
			`/manage/groups/${groupId}/members`,
			{ members },
			options
		);
	}

	static async removeGroupMember(
		groupId: number,
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlGroup>> {
		return ApiService.delete<AccessControlGroup>(
			`/manage/groups/${groupId}/members/${userId}`,
			options
		);
	}

	// Group → case access
	static async setGroupCasesAccess(
		groupId: number,
		body:
			| { auto_follow_cases: true; access_level: number }
			| { auto_follow_cases?: false; cases_list: number[]; access_level: number },
		options: ApiOptions = {}
	): Promise<RequestResponse<AccessControlGroup>> {
		return ApiService.post<AccessControlGroup>(
			`/manage/groups/${groupId}/cases-access`,
			body,
			options
		);
	}

	static async deleteGroupCasesAccess(
		groupId: number,
		cases: number[]
	): Promise<RequestResponse<AccessControlGroup>> {
		return jsonDelete<AccessControlGroup>(`/api/v2/manage/groups/${groupId}/cases-access`, {
			cases
		});
	}

	// ----- Schema + lookups ------------------------------------------
	static async schema(options: ApiOptions = {}): Promise<RequestResponse<AccessControlSchemaInfo>> {
		return ApiService.get<AccessControlSchemaInfo>('/manage/access-control/schema', options);
	}

	static async accessibleCases(
		search?: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ data: AccessibleCaseSummary[] }>> {
		return ApiService.get<{ data: AccessibleCaseSummary[] }>(
			ApiService.withQuery('/manage/access-control/accessible-cases', { search }),
			options
		);
	}

	static async recomputeAllAccess(
		options: ApiOptions = {}
	): Promise<RequestResponse<{ message: string }>> {
		return ApiService.post<{ message: string }>(
			'/manage/access-control/recompute-all',
			{},
			options
		);
	}
}

// ---- Local helpers ---------------------------------------------------

/**
 * `DELETE` with a JSON body. ApiService.delete strips bodies (HTTP
 * spec ambiguity), but our v2 routes accept `{cases}` payloads to
 * batch bulk removals. The hand-rolled fetch below mirrors the
 * auth + base-URL setup of `ApiService.request` so callers see the
 * same `RequestResponse` shape they get from a normal call.
 */
async function jsonDelete<T>(
	path: string,
	body: Record<string, unknown>
): Promise<RequestResponse<T>> {
	const { auth } = await import('$lib/stores/auth.store');
	const { AuthService } = await import('./auth.service');
	const { apiOrigin } = await import('$lib/config/api.config');

	if (auth.isTokenExpired() && !auth.isRefreshTokenExpired()) {
		await AuthService.refreshToken();
	}

	const baseUrl = apiOrigin();

	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		Accept: 'application/json'
	};
	const token = auth.getAccessToken();
	if (token) headers.Authorization = `Bearer ${token}`;

	const response = await (typeof window !== 'undefined' ? window.fetch : globalThis.fetch)(
		`${baseUrl}${path}`,
		{
			method: 'DELETE',
			headers,
			body: JSON.stringify(body)
		}
	);

	let data: T | string | null = null;
	try {
		const ct = response.headers.get('content-type') ?? '';
		data = ct.includes('application/json') ? ((await response.json()) as T) : await response.text();
	} catch {
		data = null;
	}

	return { data, status: response.status, headers: response.headers, ok: response.ok };
}

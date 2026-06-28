/**
 * Thin wrapper around the v2 access-control endpoints.
 *
 * Set / revoke flows go through `/api/v2/manage/users/<id>/cases-access`
 * (POST = grant, DELETE = revoke) and the corresponding `/groups/<id>`
 * routes. The legacy `/manage/.../cases-access/update` and `/delete`
 * POSTs are still present on the server for backward compatibility,
 * but every new caller must use the v2 surface — those legacy paths
 * skip the v2 access serializer + `track_activity` shape, and writes
 * routed through them silently miss the war-room people banner.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type UserIdentifier = number;
export type GroupIdentifier = number;

export enum AccessLevel {
	DENY_ALL = 0x1,
	READ_ONLY = 0x2,
	FULL_ACCESS = 0x4
}

export type AccessLevelItem = {
	name: string;
	value: number;
};

export type CaseAccessEntry = {
	case_id: number;
	access_level: number;
	case_name?: string;
	access_level_list?: AccessLevelItem[];
};

export interface UserCasesAccessBody {
	cases_list: number[];
	access_level: number;
}

export interface UserCasesAccessDeleteBody {
	cases: number[];
}

export interface GroupCasesAccessBody {
	access_level: number;
	auto_follow_cases?: boolean;
	cases_list?: number[];
}

export interface GroupCasesAccessDeleteBody {
	cases: number[];
}

export class CaseAccessService {
	// --- Users ---------------------------------------------------------

	static async listUserCasesAccess(
		userId: UserIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseAccessEntry[]>> {
		return ApiService.get<CaseAccessEntry[]>(
			`/api/v2/manage/users/${userId}/cases-access`,
			options
		);
	}

	static async setUserCasesAccess(
		userId: UserIdentifier,
		body: UserCasesAccessBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<unknown>> {
		return ApiService.post<unknown>(
			`/api/v2/manage/users/${userId}/cases-access`,
			body,
			options
		);
	}

	static async deleteUserCasesAccess(
		userId: UserIdentifier,
		body: UserCasesAccessDeleteBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<unknown>> {
		// DELETE-with-body — supported by ApiService.delete via its
		// optional `body` argument.
		return ApiService.delete<unknown, UserCasesAccessDeleteBody>(
			`/api/v2/manage/users/${userId}/cases-access`,
			options,
			body
		);
	}

	// --- Groups --------------------------------------------------------

	static async listGroupCasesAccess(
		groupId: GroupIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseAccessEntry[]>> {
		return ApiService.get<CaseAccessEntry[]>(
			`/api/v2/manage/groups/${groupId}/cases-access`,
			options
		);
	}

	static async setGroupCasesAccess(
		groupId: GroupIdentifier,
		body: GroupCasesAccessBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<unknown>> {
		return ApiService.post<unknown>(
			`/api/v2/manage/groups/${groupId}/cases-access`,
			body,
			options
		);
	}

	static async deleteGroupCasesAccess(
		groupId: GroupIdentifier,
		body: GroupCasesAccessDeleteBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<unknown>> {
		return ApiService.delete<unknown, GroupCasesAccessDeleteBody>(
			`/api/v2/manage/groups/${groupId}/cases-access`,
			options,
			body
		);
	}
}

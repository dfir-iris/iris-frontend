import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type GroupIdentifier = number;

export interface GroupMember {
	id: number;
	name: string;
	user: string;
}

export interface GroupPermissionItem {
	name: string;
	value: number;
}

export interface Group {
	group_auto_follow: boolean;
	group_auto_follow_access_level: number;
	group_description: string;
	group_id: number;
	group_members: GroupMember[];
	group_name: string;
	group_permissions: number;
	group_permissions_list: GroupPermissionItem[];
	group_uuid: string;
	registry: null;
}

export interface CreateGroupBody {
	group_name: string;
	group_description: string;
	group_permissions: number;
}

export interface UpdateGroupBody {
	group_name?: string;
	group_description?: string;
	group_permissions?: number;
}

export interface UpdateGroupMembersBody {
	group_members: number[];
}

/**
 * Hits the v2 groups surface. The v2 `PUT /<id>/members` accepts
 * `{members: [int]}` but also tolerates the legacy `group_members`
 * key, so this wrapper's payload shape is unchanged.
 */
export class GroupsService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<Group[]>> {
		// Returns the paginated envelope `{total, data, ...}`; the
		// existing consumer (`CaseAccessGroup.svelte`) reaches into
		// `res.data.data` so the shape is back-compat. per_page=200
		// covers any realistic group count in one request.
		return ApiService.get<Group[]>('/manage/groups?per_page=200', options);
	}

	static async create(
		body: CreateGroupBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Group>> {
		return ApiService.post<Group>('/manage/groups', body, options);
	}

	static async update(
		groupId: GroupIdentifier,
		body: UpdateGroupBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Group>> {
		return ApiService.put<Group>(`/manage/groups/${groupId}`, body, options);
	}

	static async remove(
		groupId: GroupIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/manage/groups/${groupId}`, options);
	}

	static async updateMembers(
		groupId: GroupIdentifier,
		body: UpdateGroupMembersBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.put<null>(`/manage/groups/${groupId}/members`, body, options);
	}

	static async removeMember(
		groupId: GroupIdentifier,
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/manage/groups/${groupId}/members/${userId}`, options);
	}
}

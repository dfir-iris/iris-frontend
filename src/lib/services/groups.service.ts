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

export class GroupsService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<Group[]>> {
		return ApiService.get<Group[]>(`/manage/groups/list`, options);
	}

	static async create(
		body: CreateGroupBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Group>> {
		return ApiService.post<Group>(`/manage/groups/add`, body, options);
	}

	static async update(
		groupId: GroupIdentifier,
		body: UpdateGroupBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Group>> {
		return ApiService.post<Group>(`/manage/groups/update/${groupId}`, body, options);
	}

	static async remove(
		groupId: GroupIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.post<null>(`/manage/groups/delete/${groupId}`, {}, options);
	}

	static async updateMembers(
		groupId: GroupIdentifier,
		body: UpdateGroupMembersBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.post<null>(`/manage/groups/${groupId}/members/update`, body, options);
	}

	static async removeMember(
		groupId: GroupIdentifier,
		userId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.post<null>(`/manage/groups/${groupId}/members/delete/${userId}`, {}, options);
	}
}

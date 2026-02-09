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
	static async listUserCasesAccess(
		userId: UserIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseAccessEntry[]>> {
		return ApiService.get<CaseAccessEntry[]>(`/manage/users/${userId}/cases-access`, options);
	}

	static async setUserCasesAccess(
		userId: UserIdentifier,
		body: UserCasesAccessBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<unknown>> {
		return ApiService.post<unknown>(`/manage/users/${userId}/cases-access/update`, body, options);
	}

	static async deleteUserCasesAccess(
		userId: UserIdentifier,
		body: UserCasesAccessDeleteBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<unknown>> {
		return ApiService.post<unknown>(`/manage/users/${userId}/cases-access/delete`, body, options);
	}

	static async listGroupCasesAccess(
		groupId: GroupIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseAccessEntry[]>> {
		return ApiService.get<CaseAccessEntry[]>(`/manage/groups/${groupId}/cases-access`, options);
	}

	static async setGroupCasesAccess(
		groupId: GroupIdentifier,
		body: GroupCasesAccessBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<unknown>> {
		return ApiService.post<unknown>(`/manage/groups/${groupId}/cases-access/update`, body, options);
	}

	static async deleteGroupCasesAccess(
		groupId: GroupIdentifier,
		body: GroupCasesAccessDeleteBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<unknown>> {
		return ApiService.post<unknown>(`/manage/groups/${groupId}/cases-access/delete`, body, options);
	}
}

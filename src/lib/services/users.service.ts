import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { UserInfo } from './auth.service';

export type UserIdentifier = number;

export interface User {
	id: number;
	user_id: number;
	user_login: string;
	user_name: string;
	user_email: string;
	uuid: string;

	active: boolean;
	user_is_service_account: boolean;
	has_deletion_confirmation: boolean;
	has_mini_sidebar: boolean;

	user_api_key: string;

	in_dark_mode: boolean | null;
	external_id: string | null;
}

export interface CreateUserBody extends UserInfo {
	user_password: string;
}

export interface UpdateUserBody {
	user_name?: string;
	user_login?: string;
	user_email?: string;
	user_password?: string;
}

export class UsersService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<User[]>> {
		return ApiService.get<User[]>(`/manage/users/list`, options);
	}

	static async get(
		userId: UserIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<User>> {
		return ApiService.get<User>(`/manage/users/${userId}`, options);
	}

	static async create(
		body: CreateUserBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<User>> {
		return ApiService.post<User>(`/manage/users/add`, body, options);
	}

	static async update(
		userId: UserIdentifier,
		body: UpdateUserBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<User>> {
		return ApiService.post<User>(`/manage/users/update/${userId}`, body, options);
	}

	static async remove(
		userId: UserIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.post<null>(`/manage/users/delete/${userId}`, {}, options);
	}
}

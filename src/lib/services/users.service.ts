import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';
import type { UserInfo } from './auth.service';

export type UserIdentifier = number;

/**
 * Shape exposed by the v2 backend (`UserSchemaForAPIV2`).
 *
 * Field names mirror the schema exactly. The legacy aliases
 * (`id`, `active`) are kept as optional for any straggling caller
 * that hasn't been migrated — both fall through to `user_id` /
 * `user_active` if missing.
 */
export interface User {
	user_id: number;
	user_login: string;
	user_name: string;
	user_email: string;
	user_active: boolean;
	user_is_service_account?: boolean;
	user_isadmin?: boolean;
	user_api_key?: string;
	user_groups?: Array<{ group_id: number; group_name: string; group_uuid?: string }>;
	user_permissions?: Array<{ group_name: string; group_permissions: number }>;
	user_customers?: Array<{ customer_id: number; customer_name: string }>;
	user_cases_access?: Array<{ access_level: number; case_id: number; case_name?: string }>;
	user_organisations?: unknown[];
	user_primary_organisation_id?: number | null;
	/** @deprecated use `user_id` */
	id?: number;
	/** @deprecated use `user_active` */
	active?: boolean;
	[key: string]: unknown;
}

export interface CreateUserBody extends UserInfo {
	user_password: string;
}

export interface UpdateUserBody {
	user_name?: string;
	user_login?: string;
	user_email?: string;
	user_password?: string;
	user_active?: boolean;
}

/**
 * Thin v2 wrapper. The legacy `/manage/users/list` envelope
 * (`{status, message, data: User[]}`) shared its `data: T[]` key with
 * the v2 paginated envelope (`{total, data, last_page, ...}`); every
 * existing caller reaches into `res.data.data` to unwrap, so the
 * URL swap is transparent.
 */
export class UsersService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<Paginated<User>>> {
		return ApiService.get<Paginated<User>>('/manage/users?per_page=200', options);
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
		return ApiService.post<User>('/manage/users', body, options);
	}

	static async update(
		userId: UserIdentifier,
		body: UpdateUserBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<User>> {
		return ApiService.put<User>(`/manage/users/${userId}`, body, options);
	}

	static async remove(
		userId: UserIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/manage/users/${userId}`, options);
	}
}

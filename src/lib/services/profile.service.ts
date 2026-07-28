import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

// Shape of the currently authenticated user as returned by `GET /api/v2/me`.
// The backend's `UserSchemaForAPIV2` auto-serialises every column that isn't
// in its `exclude` list, so the user-preference flags (`in_dark_mode`,
// `has_deletion_confirmation`, `has_mini_sidebar`) come through alongside
// the canonical user_* fields.
export interface Profile {
	user_id: number;
	uuid: string;
	user_name: string;
	user_login: string;
	user_email: string;
	user_api_key: string;
	user_isadmin: boolean;
	user_is_service_account: boolean;
	user_active: boolean;

	in_dark_mode: boolean | null;
	has_mini_sidebar: boolean;
	has_deletion_confirmation: boolean;
}

// Shape accepted by `PUT /api/v2/me`. Mirrors the load-only fields on the
// backend schema (`user_password` is write-only, never echoed back).
// `user_current_password` is consumed by the v2 update handler — not a
// model column — and is required whenever `user_password` is set.
export interface ProfileUpdateBody {
	user_name?: string;
	user_login?: string;
	user_email?: string;
	user_password?: string;
	user_current_password?: string;
	in_dark_mode?: boolean;
	has_mini_sidebar?: boolean;
	has_deletion_confirmation?: boolean;
}

// Named per-user API key (UserApiKey). Multi-key + revocable + optional
// scope_mask. Plaintext `api_key` is only present on the create-response
// body — never on subsequent list / get. See UserApiKeySchema on the
// backend.
export interface UserApiKey {
	id: number;
	user_id: number;
	name: string;
	scope_mask: number | null;
	created_at: string;
	last_used_at: string | null;
	revoked_at: string | null;
}

export interface UserApiKeyList {
	api_keys: UserApiKey[];
}

// Response for `POST /api/v2/me/api-keys`. Adds the plaintext `api_key`
// once — after this it disappears from the metadata endpoints.
export interface UserApiKeyCreated extends UserApiKey {
	api_key: string;
}

export interface UserApiKeyCreateBody {
	name: string;
	// Integer bitmask of Permissions values to AND with the user's
	// effective mask on every request authenticated with this key.
	// Omit or null for a full-permissions key.
	scope_mask?: number | null;
}

export class ProfileService {
	static async get(options: ApiOptions = {}): Promise<RequestResponse<Profile>> {
		return ApiService.get<Profile>(`/me`, options);
	}

	static async update(
		body: ProfileUpdateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Profile>> {
		return ApiService.put<Profile>(`/me`, body, options);
	}

	static async renewApiKey(options: ApiOptions = {}): Promise<RequestResponse<Profile>> {
		return ApiService.post<Profile>(`/me/api-key/renew`, {}, options);
	}

	static async refreshPermissions(options: ApiOptions = {}): Promise<RequestResponse<Profile>> {
		return ApiService.post<Profile>(`/me/permissions/refresh`, {}, options);
	}

	// ---- Named per-user API keys (UserApiKey) --------------------------

	static async listApiKeys(
		options: ApiOptions = {}
	): Promise<RequestResponse<UserApiKeyList>> {
		return ApiService.get<UserApiKeyList>(`/me/api-keys`, options);
	}

	static async createApiKey(
		body: UserApiKeyCreateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<UserApiKeyCreated>> {
		return ApiService.post<UserApiKeyCreated>(`/me/api-keys`, body, options);
	}

	static async revokeApiKey(
		keyId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<UserApiKey>> {
		return ApiService.delete<UserApiKey>(`/me/api-keys/${keyId}`, options);
	}
}

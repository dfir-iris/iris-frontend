/**
 * v2 service for the Settings → Server Settings page.
 *
 * Backs onto `/api/v2/manage/server/...`:
 *   * `GET  /settings`     — returns the singleton row + the read-only
 *                            `versions` block (IRIS / API / module
 *                            interface versions + alembic head).
 *   * `PUT  /settings`     — partial update; the backend echoes the
 *                            full refreshed row so the page can swap
 *                            local state in one round-trip.
 *   * `POST /backups/db`   — triggers a synchronous Postgres dump.
 *
 * The shape mirrors `ServerSettingsSchema` on the backend. Every
 * field is optional in the body of `PUT /settings` — only the values
 * the admin actually changed need to be sent.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface ServerSettings {
	http_proxy: string | null;
	https_proxy: string | null;
	prevent_post_mod_repush: boolean;
	prevent_post_objects_repush: boolean;
	/** Set by the periodic update checker — surfaced read-only on the page. */
	has_updates_available: boolean;
	enable_updates_check: boolean;
	password_policy_min_length: number;
	password_policy_upper_case: boolean;
	password_policy_lower_case: boolean;
	password_policy_digit: boolean;
	password_policy_special_chars: string | null;
	enforce_mfa: boolean;
	force_confirmation_before_delete: boolean;
}

/**
 * Read-only `versions` block returned alongside the settings row.
 * Sourced from `app.config` + the alembic head — not from the
 * `ServerSettings` table, so it's never editable.
 */
export interface ServerVersions {
	iris_version: string;
	api_min: string;
	api_max: string;
	module_interface_min: string;
	module_interface_max: string;
	db_revision: string | null;
}

export interface ServerSettingsResponse {
	settings: ServerSettings;
	versions: ServerVersions;
}

export type ServerSettingsUpdateBody = Partial<ServerSettings>;

export interface BackupResult {
	logs: string[];
}

export class ServerSettingsService {
	static async get(
		options: ApiOptions = {}
	): Promise<RequestResponse<ServerSettingsResponse>> {
		return ApiService.get<ServerSettingsResponse>('/manage/server/settings', options);
	}

	static async update(
		body: ServerSettingsUpdateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<ServerSettings>> {
		return ApiService.put<ServerSettings>('/manage/server/settings', body, options);
	}

	static async backupDb(
		options: ApiOptions = {}
	): Promise<RequestResponse<BackupResult>> {
		return ApiService.post<BackupResult>('/manage/server/backups/db', {}, options);
	}
}

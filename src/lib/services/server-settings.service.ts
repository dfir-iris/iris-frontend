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

	// ---- Mail — outbound (SMTP) --------------------------------------
	mail_smtp_enabled: boolean | null;
	mail_smtp_host: string | null;
	mail_smtp_port: number | null;
	mail_smtp_user: string | null;
	// Never present in a GET response — write-only.
	mail_smtp_password?: string | null;
	// Derived boolean the backend attaches to the GET dump so the SPA
	// can render a "•••••" placeholder vs an empty input.
	mail_smtp_password_set?: boolean;
	mail_smtp_use_tls: boolean | null;
	mail_smtp_use_ssl: boolean | null;
	mail_from_address: string | null;
	mail_from_name: string | null;

	// ---- Mail — inbound (IMAP) ---------------------------------------
	mail_imap_enabled: boolean | null;
	mail_imap_host: string | null;
	mail_imap_port: number | null;
	mail_imap_user: string | null;
	mail_imap_password?: string | null;
	mail_imap_password_set?: boolean;
	mail_imap_use_ssl: boolean | null;
	mail_imap_mailbox: string | null;
	mail_imap_poll_interval_sec: number | null;
	mail_imap_max_attachment_mb: number | null;

	// ---- Error reporting (Sentry-compatible ingest) ------------------
	// Off by default. Backend DSN is Fernet-encrypted at rest and is
	// load-only on the schema — the SPA sees only the derived
	// `error_reporting_backend_dsn_set` boolean. The frontend DSN is
	// round-trippable because the browser needs to read it at boot to
	// init the Sentry SDK (see /api/v2/runtime-config).
	error_reporting_enabled: boolean | null;
	error_reporting_backend_dsn?: string | null;
	error_reporting_backend_dsn_set?: boolean;
	error_reporting_frontend_dsn: string | null;
	error_reporting_environment: string | null;
	error_reporting_sample_rate: number | null;
	error_reporting_include_user: boolean | null;

	// ---- MCP (Model Context Protocol) endpoint ----------------------
	// Off by default. When on, `/api/v2/mcp` accepts JSON-RPC 2.0
	// requests from MCP clients (Claude Desktop, Claude Code, ...)
	// authenticated with an IRIS API key. See the Settings → MCP Server
	// page for the paradigm.
	mcp_enabled: boolean;
	mcp_max_calls_per_minute_per_worker: number;
	mcp_expose_admin_tools: boolean;
	mcp_tool_allowlist: string;
	mcp_tool_denylist: string;
}

export interface TestMailBody {
	to: string;
}

export interface TestMailResult {
	delivered: boolean;
	to: string;
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

	/**
	 * Trigger a probe SMTP send using the current mail config.
	 * Runs synchronously on the server — this is a diagnostic, not the
	 * normal delivery path.
	 */
	static async sendTestMail(
		body: TestMailBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<TestMailResult>> {
		return ApiService.post<TestMailResult>(
			'/manage/server/mail/test-send', body, options);
	}
}

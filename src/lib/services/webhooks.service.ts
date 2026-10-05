import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';

export type WebhookMethod = 'POST' | 'PUT' | 'PATCH' | 'GET' | 'DELETE';
export type WebhookAuthType = 'none' | 'basic' | 'bearer';
export type WebhookBodyMode = 'default' | 'template' | 'none';
export type WebhookDeliveryStatus = 'pending' | 'retrying' | 'success' | 'failed' | 'skipped';
export type WebhookDeliveryTrigger = 'event' | 'manual' | 'test' | 'redeliver';

/**
 * A header or query parameter. Secret entries come back with
 * `value: null` and `has_value` — the API never returns a secret. On
 * write, a secret entry sent with `value: null` keeps the stored value.
 */
export interface WebhookEntry {
	name: string;
	value: string | null;
	secret: boolean;
	has_value?: boolean;
}

export interface WebhookLastDelivery {
	status: WebhookDeliveryStatus;
	response_status: number | null;
	event: string;
	created_at: string;
	error: string | null;
}

export interface Webhook {
	id: number;
	name: string;
	description: string | null;
	enabled: boolean;
	/**
	 * Event names. `'*'` stands for every automatic event; manual
	 * triggers are always listed by name, next to it if need be.
	 */
	events: string[];
	/** Object menu entry of the manual triggers; null shows the name. */
	manual_label: string | null;
	condition: string | null;
	method: WebhookMethod;
	url: string;
	query_params: WebhookEntry[];
	headers: WebhookEntry[];
	auth_type: WebhookAuthType;
	auth_username: string | null;
	has_auth_secret: boolean;
	body_mode: WebhookBodyMode;
	body_template: string | null;
	content_type: string;
	has_signing_secret: boolean;
	verify_tls: boolean;
	timeout_seconds: number;
	max_retries: number;
	follow_redirects: boolean;
	use_proxy: boolean;
	created_by: { id: number; name: string } | null;
	created_at: string | null;
	updated_at: string | null;
	last_delivery: WebhookLastDelivery | null;
	/** Deliveries of the last 24 hours, by status. */
	deliveries_24h: Partial<Record<WebhookDeliveryStatus, number>>;
}

/**
 * Write body. Every field is optional on update — left out keeps the
 * stored value. `auth_secret` / `signing_secret`: absent keeps, `null`
 * or `''` clears, a string replaces.
 */
export interface WebhookBody {
	name?: string;
	description?: string | null;
	enabled?: boolean;
	events?: string[];
	manual_label?: string | null;
	condition?: string | null;
	method?: WebhookMethod;
	url?: string;
	query_params?: WebhookEntry[];
	headers?: WebhookEntry[];
	auth_type?: WebhookAuthType;
	auth_username?: string | null;
	auth_secret?: string | null;
	body_mode?: WebhookBodyMode;
	body_template?: string | null;
	content_type?: string;
	signing_secret?: string | null;
	verify_tls?: boolean;
	timeout_seconds?: number;
	max_retries?: number;
	follow_redirects?: boolean;
	use_proxy?: boolean;
}

export interface WebhookEvent {
	name: string;
	object_type: string;
	object_label: string;
	action: string;
	label: string;
	description: string;
	/** An `on_manual_trigger_*` hook: fired from the object menu. */
	manual: boolean;
}

export interface WebhookSettings {
	allow_private_egress: boolean;
	instance_url_configured: boolean;
	/** A server settings or environment proxy is set. */
	proxy_configured: boolean;
}

export interface WebhookRenderError {
	field: string;
	message: string;
}

/** A request as sent, secrets masked. */
export interface WebhookRequestPreview {
	method: string;
	url: string;
	headers: Record<string, string>;
	body: string | null;
	errors: WebhookRenderError[];
}

export type WebhookSampleSource = 'last_delivery' | 'sample';

export interface WebhookPreview {
	event: string;
	sample_source: WebhookSampleSource;
	condition: { matches: boolean | null; error: string | null };
	request: WebhookRequestPreview;
	/** Every variable the templates can use. */
	context: Record<string, unknown>;
}

export interface WebhookTestResult {
	event: string;
	sample_source: WebhookSampleSource;
	delivery_id: number | null;
	request: WebhookRequestPreview;
	response: {
		success: boolean;
		status_code: number | null;
		headers: Record<string, string> | null;
		body: string | null;
		error: string | null;
		duration_ms: number | null;
	};
}

/**
 * Preview / test input: the form as it stands (saved or not) and, when
 * editing, the id of the stored webhook so unchanged secrets resolve.
 */
export interface WebhookSandboxBody {
	webhook: WebhookBody;
	webhook_id?: number | null;
	event?: string | null;
}

export interface WebhookDelivery {
	id: number;
	uuid: string | null;
	webhook_id: number;
	event: string;
	event_label: string;
	trigger: WebhookDeliveryTrigger;
	status: WebhookDeliveryStatus;
	attempts: number;
	response_status: number | null;
	error: string | null;
	duration_ms: number | null;
	created_at: string | null;
	completed_at: string | null;
	title: string | null;
}

export interface WebhookDeliveryDetail extends WebhookDelivery {
	request_method: string | null;
	request_url: string | null;
	request_headers: Record<string, string> | null;
	request_body: string | null;
	response_headers: Record<string, string> | null;
	response_body: string | null;
	payload: Record<string, unknown> | null;
}

export interface WebhookDeliveryFilters {
	status?: WebhookDeliveryStatus | null;
	event?: string | null;
	page?: number;
	per_page?: number;
}

export interface WebhookLegacyStatus {
	installed: boolean;
	active: boolean;
	module_id: number | null;
	webhook_count: number;
	error: string | null;
}

export interface WebhookLegacyImportResult {
	created: { id: number; name: string; warnings: string[] }[];
	skipped: { name: string; errors: Record<string, string[]>; warnings: string[] }[];
	notes: string[];
}

/** 400 body: `data` maps a field to its messages. */
export interface WebhookValidationError {
	message: string;
	data?: Record<string, string[]>;
}

const BASE = '/manage/webhooks';

export class WebhooksService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<Webhook[]>> {
		return ApiService.get<Webhook[]>(BASE, options);
	}

	static async get(id: number, options: ApiOptions = {}): Promise<RequestResponse<Webhook>> {
		return ApiService.get<Webhook>(`${BASE}/${id}`, options);
	}

	static async create(
		body: WebhookBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Webhook>> {
		return ApiService.post<Webhook>(BASE, body, options);
	}

	static async update(
		id: number,
		body: WebhookBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Webhook>> {
		return ApiService.put<Webhook>(`${BASE}/${id}`, body, options);
	}

	static async remove(id: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`${BASE}/${id}`, options);
	}

	static async events(options: ApiOptions = {}): Promise<RequestResponse<WebhookEvent[]>> {
		return ApiService.get<WebhookEvent[]>(`${BASE}/events`, options);
	}

	static async settings(options: ApiOptions = {}): Promise<RequestResponse<WebhookSettings>> {
		return ApiService.get<WebhookSettings>(`${BASE}/settings`, options);
	}

	/** Render the request without sending it. */
	static async preview(
		body: WebhookSandboxBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WebhookPreview>> {
		return ApiService.post<WebhookPreview>(`${BASE}/preview`, body, options);
	}

	/** Send a sample event now and return the receiver's response. */
	static async test(
		body: WebhookSandboxBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WebhookTestResult>> {
		return ApiService.post<WebhookTestResult>(`${BASE}/test`, body, options);
	}

	static async deliveries(
		id: number,
		filters: WebhookDeliveryFilters = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<WebhookDelivery>>> {
		const params: Record<string, unknown> = {
			page: filters.page ?? 1,
			per_page: filters.per_page ?? 25
		};
		if (filters.status) params.status = filters.status;
		if (filters.event) params.event = filters.event;
		return ApiService.get<Paginated<WebhookDelivery>>(
			ApiService.withQuery(`${BASE}/${id}/deliveries`, params),
			options
		);
	}

	static async delivery(
		deliveryId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WebhookDeliveryDetail>> {
		return ApiService.get<WebhookDeliveryDetail>(`${BASE}/deliveries/${deliveryId}`, options);
	}

	static async redeliver(
		deliveryId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WebhookDelivery>> {
		return ApiService.post<WebhookDelivery>(
			`${BASE}/deliveries/${deliveryId}/redeliver`,
			{},
			options
		);
	}

	static async legacyStatus(
		options: ApiOptions = {}
	): Promise<RequestResponse<WebhookLegacyStatus>> {
		return ApiService.get<WebhookLegacyStatus>(`${BASE}/legacy-module`, options);
	}

	static async legacyImport(
		options: ApiOptions = {}
	): Promise<RequestResponse<WebhookLegacyImportResult>> {
		return ApiService.post<WebhookLegacyImportResult>(`${BASE}/legacy-module/import`, {}, options);
	}
}

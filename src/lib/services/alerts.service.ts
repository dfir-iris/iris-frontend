import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { Alert } from '$lib/types/resources/alert';

export type AlertIdentifier = number;
export type SortDir = 'asc' | 'desc';

export interface FilterAlertsParams {
	alert_title?: string;
	alert_description?: string;
	alert_source?: string;
	alert_tags?: string | string[];
	alert_status_id?: number;
	alert_severity_id?: number;
	alert_classification_id?: number;
	alert_customer_id?: number;
	alert_start_date?: string;
	alert_end_date?: string;
	alert_assets?: string | string[];
	alert_iocs?: string | string[];
	alert_ids?: string | number[];
	case_id?: number;
	alert_owner_id?: number;
	page?: number;
	per_page?: number;
	sort?: SortDir;
}

export type FilterAlertsData = {
	total: number;
	alerts: Alert[];
	last_page?: number | null;
	current_page?: number;
	next_page?: number | null;
};

export type FilterAlertsMessage = {
	status: string;
	message: string;
	data: FilterAlertsData;
};

export interface CreateAlertBody {
	alert_title: string;
	alert_severity_id: number;
	alert_customer_id: number;
	alert_classification_id: number;
	alert_description?: string;
	alert_source?: string;
	alert_source_ref?: string;
	alert_source_link?: string;
	alert_status_id?: number;
	alert_context?: Record<string, unknown>;
	alert_source_event_time?: string;
	alert_note?: string;
	alert_tags?: string;
	alert_owner_id?: number | null;

	alert_iocs?: Array<{
		ioc_value: string;
		ioc_description?: string;
		ioc_tlp_id?: number;
		ioc_type_id?: number;
		ioc_tags?: string;
		ioc_enrichment?: Record<string, unknown>;
	}>;

	alert_assets?: Array<{
		asset_name: string;
		asset_description?: string;
		asset_type_id: number;
		asset_ip?: string;
		asset_domain?: string;
		asset_tags?: string;
		asset_enrichment?: Record<string, unknown>;
	}>;

	alert_source_content?: Record<string, unknown>;
}

export type UpdateAlertBody = Partial<CreateAlertBody>;

export type RelatedAlert = {
	assets: unknown;
	iocs: unknown;
};

function toCommaSeparated(value?: string | string[] | number[]): string | undefined {
	if (value == null) return undefined;
	if (Array.isArray(value)) return value.map(String).join(',');
	return value;
}

export class AlertService {
	static async list(
		params: FilterAlertsParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<FilterAlertsMessage>> {
		const query: Record<string, unknown> = {
			...params,
			alert_tags: toCommaSeparated(params.alert_tags),
			alert_assets: toCommaSeparated(params.alert_assets),
			alert_iocs: toCommaSeparated(params.alert_iocs),
			alert_ids: toCommaSeparated(params.alert_ids)
		};

		const path = ApiService.withQuery('/alerts/filter', query);
		return ApiService.get<FilterAlertsMessage>(path, options);
	}

	static async get(
		alertId: AlertIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Alert>> {
		return ApiService.get<Alert>(`/api/v2/alerts/${alertId}`, options);
	}

	static async create(
		body: CreateAlertBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Alert>> {
		return ApiService.post<Alert, CreateAlertBody>(`/api/v2/alerts`, body, options);
	}

	static async update(
		alertId: AlertIdentifier,
		body: UpdateAlertBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Alert>> {
		return ApiService.put<Alert, UpdateAlertBody>(`/api/v2/alerts/${alertId}`, body, options);
	}

	static async remove(
		alertId: AlertIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/alerts/${alertId}`, options);
	}

	static async getRelatedAlerts(
		alertId: AlertIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<RelatedAlert>> {
		return ApiService.get<RelatedAlert>(`/api/v2/alerts/${alertId}/related-alerts`, options);
	}
}

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
	alert_resolution_status_id?: number | null;

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

export type RelatedAlertNode = {
	id: string;
	label: string;
	title?: string;
	group: string;
	shape?: string;
	icon?: {
		face?: string;
		code?: string;
		color?: string;
		weight?: string;
	};
	image?: string;
	font?: string;
};

export type RelatedAlertEdge = {
	from: string;
	to: string;
	dashes?: boolean;
};

export type RelatedAlert = {
	nodes: RelatedAlertNode[];
	edges: RelatedAlertEdge[];
};

export interface MergeAlertBody {
	iocs_import_list?: string[];
	assets_import_list?: string[];
	note?: string;
	import_as_event?: boolean;
	target_case_id: number;
}

export interface EscalateAlertBody {
	iocs_import_list?: string[];
	assets_import_list?: string[];
	note?: string;
	import_as_event?: boolean;
	case_tags?: string;
	case_template_id?: string;
	case_title?: string;
}

export type MergeAlertResponse = {
	status: string;
	message: string;
	data: {
		case_id: number;
		case_name: string;
		case_customer: number;
		case_uuid: string;
		case_description: string;
		open_date: string;
		status_id: number;
		modification_history: null;
		case_soc_id: string;
		state_id: number;
		close_date: null;
		classification_id: number;
		closing_note: null;
		owner_id: number;
		user_id: number;
		custom_attributes: Record<string, unknown>;
		reviewer_id: null;
		review_status_id: null;
		severity_id: number;
	};
};

export type EscalateAlertResponse = MergeAlertResponse;

const toCommaSeparated = (value?: string | string[] | number[]): string | undefined => {
	if (value == null) return undefined;
	if (Array.isArray(value)) return value.map(String).join(',');
	return value;
}

const parseRelatedAlert = (value: unknown): RelatedAlert => {
	if (typeof value !== 'object' || value === null) {
		return { nodes: [], edges: [] };
	}

	const data = value as {
		nodes?: RelatedAlertNode[];
		edges?: RelatedAlertEdge[];
	};

	return {
		nodes: Array.isArray(data.nodes) ? data.nodes : [],
		edges: Array.isArray(data.edges) ? data.edges : []
	};
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
		const response = await ApiService.get<unknown>(`/api/v2/alerts/${alertId}/related-alerts`, options);

		return {
			...response,
			data: parseRelatedAlert(response.data)
		};
	}

	static async merge(
		alertId: AlertIdentifier,
		body: MergeAlertBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<MergeAlertResponse>> {
		return ApiService.post<MergeAlertResponse, MergeAlertBody>(
			`/alerts/merge/${alertId}`,
			body,
			options
		);
	}

	static async unmerge(
		alertId: AlertIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Alert>> {
		return ApiService.post<Alert, Record<string, never>>(`/alerts/unmerge/${alertId}`, {}, options);
	}

	static async escalate(
		alertId: AlertIdentifier,
		body: EscalateAlertBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<EscalateAlertResponse>> {
		return ApiService.post<EscalateAlertResponse, EscalateAlertBody>(
			`/alerts/escalate/${alertId}`,
			body,
			options
		);
	}
}

import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { Incident } from '$lib/types/resources/incident';

export interface ListIncidentsParams {
	page?: number;
	per_page?: number;
	customer_id?: number;
	status_id?: number;
	title?: string;
	sort?: string;
}

export interface CreateIncidentBody {
	incident_title: string;
	incident_description?: string;
	incident_status_id: number;
	incident_severity_id?: number | null;
	incident_customer_id: number;
	incident_owner_id?: number | null;
	alert_ids?: number[];
}

export interface UpdateIncidentBody {
	incident_title?: string;
	incident_description?: string;
	incident_status_id?: number;
	incident_severity_id?: number | null;
	incident_owner_id?: number | null;
}

export interface EscalateIncidentBody {
	template_id?: number;
	case_title?: string;
	note?: string;
	import_as_event?: boolean;
	case_tags?: string;
}

export interface MergeIncidentBody {
	target_case_id: number;
	note?: string;
	import_as_event?: boolean;
	case_tags?: string;
}

export interface EscalateIncidentResponse {
	incident_id: number;
	case_id: number;
}

export interface CaseSourceIncident {
	incident_id: number;
	incident_title: string;
	incident_status: string | null;
}

export interface PaginatedIncidents {
	data: Incident[];
	total: number;
	current_page: number;
	last_page: number | null;
	next_page: number | null;
}

export class IncidentsService {
	static async list(
		params: ListIncidentsParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<PaginatedIncidents>> {
		const path = ApiService.withQuery('/api/v2/incidents', params as Record<string, unknown>);
		return ApiService.get<PaginatedIncidents>(path, options);
	}

	static async get(id: number, options: ApiOptions = {}) {
		return ApiService.get<Incident>(`/api/v2/incidents/${id}`, options);
	}

	static async create(body: CreateIncidentBody, options: ApiOptions = {}) {
		return ApiService.post<Incident, CreateIncidentBody>('/api/v2/incidents', body, options);
	}

	static async update(id: number, body: UpdateIncidentBody, options: ApiOptions = {}) {
		return ApiService.put<Incident, UpdateIncidentBody>(`/api/v2/incidents/${id}`, body, options);
	}

	static async remove(id: number, options: ApiOptions = {}) {
		return ApiService.delete<null>(`/api/v2/incidents/${id}`, options);
	}

	static async addAlerts(id: number, alertIds: number[], options: ApiOptions = {}) {
		return ApiService.post<Incident, { alert_ids: number[] }>(
			`/api/v2/incidents/${id}/alerts`,
			{ alert_ids: alertIds },
			options
		);
	}

	static async removeAlert(id: number, alertId: number, options: ApiOptions = {}) {
		return ApiService.delete<Incident>(`/api/v2/incidents/${id}/alerts/${alertId}`, options);
	}

	static async escalate(id: number, body: EscalateIncidentBody, options: ApiOptions = {}) {
		return ApiService.post<EscalateIncidentResponse, EscalateIncidentBody>(
			`/api/v2/incidents/${id}/escalate`,
			body,
			options
		);
	}

	// Merge an incident's alerts into an existing case. Returns the same
	// `{ incident_id, case_id }` envelope as escalate so the caller can
	// navigate to the target case on success.
	static async merge(id: number, body: MergeIncidentBody, options: ApiOptions = {}) {
		return ApiService.post<EscalateIncidentResponse, MergeIncidentBody>(
			`/api/v2/incidents/${id}/merge`,
			body,
			options
		);
	}

	// Reverse lookup used by the case detail topbar to render a
	// "back to source incident" chip when the case was created from
	// (or merged into by) an incident. Backend returns `null` when the
	// case has no source incident so the chip can hide itself.
	static async forCase(caseId: number, options: ApiOptions = {}) {
		return ApiService.get<CaseSourceIncident | null>(
			`/api/v2/cases/${caseId}/source-incident`,
			options
		);
	}
}

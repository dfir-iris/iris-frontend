import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type CaseTimelineEventIdentifier = number;

export interface CaseTimelineEvent {
	event_id: number;
	event_title: string;
	event_category_id: number;
	event_date: string;
	event_tz: string;
	event_assets: number[];
	event_iocs: number[];
	event_raw?: string;
	event_source?: string;
	event_in_summary?: boolean;
	event_in_graph?: boolean;
	event_color?: string;
	event_sync_iocs_assets?: boolean;
	event_tags?: string;
	event_content?: string;
	custom_attributes?: Record<string, unknown>;
	parent_event_id?: number | null;
}

export interface CreateCaseTimelineEventBody {
	event_title: string;
	event_category_id: number;
	event_date: string;
	event_tz: string;
	event_assets: number[];
	event_iocs: number[];
	event_raw?: string;
	event_source?: string;
	event_in_summary?: boolean;
	event_in_graph?: boolean;
	event_color?: string;
	event_sync_iocs_assets?: boolean;
	event_tags?: string;
	event_content?: string;
	custom_attributes?: Record<string, unknown>;
	parent_event_id?: number | null;
}

export interface UpdateCaseTimelineEventBody {
	event_title?: string;
	event_category_id?: number;
	event_date?: string;
	event_tz?: string;
	event_assets?: number[];
	event_iocs?: number[];
	event_raw?: string;
	event_source?: string;
	event_in_summary?: boolean;
	event_in_graph?: boolean;
	event_color?: string;
	event_sync_iocs_assets?: boolean;
	event_tags?: string;
	event_content?: string;
	custom_attributes?: Record<string, unknown>;
	parent_event_id?: number | null;
}

export class CaseTimelineService {
	static async getEvent(
		caseId: number,
		eventId: CaseTimelineEventIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTimelineEvent>> {
		return ApiService.get<CaseTimelineEvent>(`/api/v2/cases/${caseId}/events/${eventId}`, options);
	}

	static async createEvent(
		caseId: number,
		body: CreateCaseTimelineEventBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTimelineEvent>> {
		return ApiService.post<CaseTimelineEvent>(`/api/v2/cases/${caseId}/events`, body, options);
	}

	static async updateEvent(
		caseId: number,
		eventId: CaseTimelineEventIdentifier,
		body: UpdateCaseTimelineEventBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTimelineEvent>> {
		return ApiService.put<CaseTimelineEvent>(
			`/api/v2/cases/${caseId}/events/${eventId}`,
			body,
			options
		);
	}

	static async removeEvent(
		caseId: number,
		eventId: CaseTimelineEventIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/cases/${caseId}/events/${eventId}`, options);
	}
}

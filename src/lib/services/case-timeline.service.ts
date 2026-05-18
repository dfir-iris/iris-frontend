import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type CaseTimelineEventIdentifier = number;

export type CaseTimelineState = {
	object_last_update: string;
	object_state: number;
};

export type CaseTimelineListResponse = {
	timeline?: CaseTimelineEvent[];
	tim?: CaseTimelineEvent[];
	comments_map?: Record<number, number[]>;
	state: CaseTimelineState;
};

export type CaseTimelineFilterQuery = {
	asset?: string[];
	asset_id?: string[];
	event_id?: string[];
	ioc?: string[];
	ioc_id?: string[];
	tag?: string[];
	title?: string[];
	description?: string[];
	raw?: string[];
	category?: string[];
	source?: string[];
	startDate?: string[];
	endDate?: string[];
	flag?: string[];
};

export type CaseTimelineApiResponse<T> = {
	status: string;
	message: string;
	data: T;
};

export interface CaseTimelineLinkedAsset {
	name: string;
	ip?: string | null;
	description?: string | null;
	compromised?: boolean;
}

export interface CaseTimelineLinkedIoc {
	name: string;
	description?: string | null;
}

export interface CaseTimelineEvent {
	event_id: number;
	event_uuid?: string;
	event_title: string;
	event_date: string;
	event_date_wtz?: string | null;
	event_tz: string;
	event_category_id?: number;
	category_name?: string;
	event_assets?: number[];
	event_iocs?: number[];
	assets?: CaseTimelineLinkedAsset[];
	iocs?: CaseTimelineLinkedIoc[];
	event_raw?: string;
	event_source?: string;
	event_in_summary?: boolean;
	event_in_graph?: boolean;
	event_is_flagged?: boolean;
	event_color?: string | null;
	event_tags?: string;
	event_content?: string;
	event_added?: string;
	user?: string;
	custom_attributes?: Record<string, unknown> | null;
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
	event_is_flagged?: boolean;
	event_color?: string;
	event_sync_iocs_assets?: boolean;
	event_tags?: string;
	event_content?: string;
	custom_attributes?: Record<string, unknown>;
	parent_event_id?: number | null;
}

export class CaseTimelineService {
	static async listEvents(
		caseId: number,
		query: CaseTimelineFilterQuery = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTimelineApiResponse<CaseTimelineListResponse>>> {
		const path = ApiService.withQuery('/api/v2/case/timeline/advanced-filter', {
			cid: caseId,
			q: JSON.stringify(query)
		});

		return ApiService.get<CaseTimelineApiResponse<CaseTimelineListResponse>>(path, {
			useApiPrefix: false,
			...options
		});
	}

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

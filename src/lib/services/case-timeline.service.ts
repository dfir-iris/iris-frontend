import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type CaseTimelineEventIdentifier = number;

export type CaseTimelineState = {
	object_last_update: string;
	object_state: number;
};

export type CaseTimelinePagination = {
	total: number;
	per_page: number;
	current_page: number;
	last_page: number;
	next_page: number | null;
};

export type CaseTimelineListResponse = {
	timeline?: CaseTimelineEvent[];
	tim?: CaseTimelineEvent[];
	comments_map?: Record<number, number[]>;
	state: CaseTimelineState;
	pagination?: CaseTimelinePagination;
};

export type CaseTimelineFilterQuery = {
	asset?: string[];
	asset_id?: number[];
	ioc?: string[];
	ioc_id?: number[];
	tag?: string[];
	title?: string[];
	description?: string[];
	raw?: string[];
	category?: string[];
	source?: string[];
	start_date?: string;
	end_date?: string;
	event_id?: number[];
	flag?: boolean;
};

export type CaseTimelineApiResponse<T> = {
	status: string;
	message: string;
	data: T;
};

export interface CaseTimelineLinkedAsset {
	id?: number;
	name: string;
	asset_name?: string;
	asset_type?: string | null;
	ip?: string | null;
	description?: string | null;
	compromised?: boolean;
}

export interface CaseTimelineLinkedIoc {
	id?: number;
	name: string;
	ioc_value?: string;
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
	// Ids of every named timeline this event is attached to. Empty
	// means the event is on no named timeline (only visible in the
	// "All" view).
	timeline_ids?: number[];
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
	timeline_ids?: number[];
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
	timeline_ids?: number[];
}

export class CaseTimelineService {
	static async listEvents(
		caseId: number,
		query: CaseTimelineFilterQuery = {},
		options: ApiOptions = {},
		paging: { page?: number; per_page?: number } = {}
	): Promise<RequestResponse<CaseTimelineListResponse>> {
		const params: Record<string, unknown> = {
			asset: query.asset,
			asset_id: query.asset_id,
			ioc: query.ioc,
			ioc_id: query.ioc_id,
			tag: query.tag,
			title: query.title,
			description: query.description,
			raw: query.raw,
			category: query.category,
			source: query.source,
			event_id: query.event_id,
			start_date: query.start_date,
			end_date: query.end_date,
			flag: query.flag !== undefined ? String(query.flag) : undefined,
			page: paging.page,
			per_page: paging.per_page
		};

		const path = ApiService.withQuery(`/api/v2/cases/${caseId}/events`, params);

		const res = await ApiService.get<CaseTimelineListResponse>(path, options);

		if (!res.ok || res.error || res.data === null || typeof res.data === 'string') {
			return res as RequestResponse<CaseTimelineListResponse>;
		}

		const data = res.data;

		return {
			...res,
			data: {
				timeline: data.tim ?? data.timeline ?? [],
				tim: data.tim,
				comments_map: data.comments_map,
				state: data.state,
				pagination: data.pagination
			}
		};
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

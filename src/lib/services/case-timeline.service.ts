import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { AlertSearchField } from './alerts.service';

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

/** How an asset / IOC takes part in an event; drives the graph direction. */
export type EventLinkRole = 'source' | 'target' | 'involved';

/** `{"<asset or ioc id>": role}`; ids not listed are `involved`. */
export type EventLinkRoles = Record<string, EventLinkRole>;

export interface CaseTimelineLinkedAsset {
	id?: number;
	name: string;
	asset_name?: string;
	asset_type?: string | null;
	ip?: string | null;
	description?: string | null;
	compromised?: boolean;
	role?: EventLinkRole;
}

export interface CaseTimelineLinkedIoc {
	id?: number;
	name: string;
	ioc_value?: string;
	description?: string | null;
	role?: EventLinkRole;
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
	event_assets_roles?: EventLinkRoles;
	event_iocs_roles?: EventLinkRoles;
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
	event_assets_roles?: EventLinkRoles;
	event_iocs_roles?: EventLinkRoles;
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
	/** Omitted: the linked objects that stay keep their role. */
	event_assets_roles?: EventLinkRoles;
	event_iocs_roles?: EventLinkRoles;
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

/** Scope shared by the search, histogram and fields endpoints. */
export interface CaseTimelineSearchScope {
	/** Search expression, compiled server-side; a 400 carries `data.position`. */
	query?: string;
	/** ISO 8601 lower bound of the event date, inclusive. */
	start?: string | null;
	/** ISO 8601 upper bound of the event date, exclusive. */
	end?: string | null;
	/** Keep events on any of these timelines. */
	timeline_ids?: number[];
}

/** A search row: the event plus what the row needs to render without a second fetch. */
export interface CaseTimelineSearchEvent extends CaseTimelineEvent {
	comments_count: number;
	children_count: number;
	/** Description and raw data are cut at 4 KiB; `getEvent` returns them whole. */
	event_content_truncated: boolean;
	event_raw_truncated: boolean;
}

export interface CaseTimelineSearchPage {
	events: CaseTimelineSearchEvent[];
	next_cursor: string | null;
	has_more: boolean;
	/** Only counted on the first page. */
	total: number | null;
}

export interface CaseTimelineHistogram {
	interval_seconds: number;
	start: string | null;
	end: string | null;
	buckets: { start: string; count: number }[];
	total: number;
}

export type CaseTimelineSummaryField =
	| 'category'
	| 'source'
	| 'tag'
	| 'asset'
	| 'ioc'
	| 'timeline'
	| 'author';

export interface CaseTimelineFieldSummary {
	values: { value: string | null; count: number }[];
	/** How many different values the field takes in scope. */
	distinct: number;
}

export interface CaseTimelineConvertedDate {
	date: string;
	time: string;
	tz: string;
}

const searchScopeParams = (scope: CaseTimelineSearchScope): Record<string, unknown> => ({
	query: scope.query?.trim() || undefined,
	start: scope.start || undefined,
	end: scope.end || undefined,
	timeline_id: scope.timeline_ids?.length ? scope.timeline_ids : undefined
});

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

	/**
	 * Server-side best-effort parse of a free-form date (ISO, syslog,
	 * RFC 2822, epoch seconds/ms, ...) into the event form's date, time
	 * and timezone fields.
	 */
	static async convertDate(
		caseId: number,
		dateValue: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTimelineConvertedDate>> {
		return ApiService.post<CaseTimelineConvertedDate>(
			`/api/v2/cases/${caseId}/events/convert-date`,
			{ date_value: dateValue },
			options
		);
	}

	/**
	 * One keyset page of the events matching `scope`. Descriptions and raw
	 * data are cut to a preview unless `full` — what an export asks for.
	 */
	static async searchEvents(
		caseId: number,
		scope: CaseTimelineSearchScope,
		paging: {
			order?: 'asc' | 'desc';
			cursor?: string | null;
			limit?: number;
			full?: boolean;
		} = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTimelineSearchPage>> {
		const path = ApiService.withQuery(`/api/v2/cases/${caseId}/events/search`, {
			...searchScopeParams(scope),
			order: paging.order,
			cursor: paging.cursor || undefined,
			limit: paging.limit,
			full: paging.full ? 'true' : undefined
		});
		return ApiService.get<CaseTimelineSearchPage>(path, options);
	}

	static async eventsHistogram(
		caseId: number,
		scope: CaseTimelineSearchScope,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTimelineHistogram>> {
		const path = ApiService.withQuery(
			`/api/v2/cases/${caseId}/events/histogram`,
			searchScopeParams(scope)
		);
		return ApiService.get<CaseTimelineHistogram>(path, options);
	}

	static async eventsFields(
		caseId: number,
		scope: CaseTimelineSearchScope,
		options: ApiOptions = {}
	): Promise<
		RequestResponse<{ fields: Partial<Record<CaseTimelineSummaryField, CaseTimelineFieldSummary>> }>
	> {
		const path = ApiService.withQuery(
			`/api/v2/cases/${caseId}/events/fields`,
			searchScopeParams(scope)
		);
		return ApiService.get(path, options);
	}

	/** The vocabulary of the search expression, in the alerts' shape. */
	static async searchSchema(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ fields: AlertSearchField[] }>> {
		return ApiService.get<{ fields: AlertSearchField[] }>(
			`/api/v2/cases/${caseId}/events/search-schema`,
			options
		);
	}

	/** Flag or unflag several events in one request. */
	static async flagEvents(
		caseId: number,
		eventIds: number[],
		flagged: boolean,
		options: ApiOptions = {}
	): Promise<RequestResponse<{ changed: number }>> {
		return ApiService.post<{ changed: number }>(
			`/api/v2/cases/${caseId}/events/flag`,
			{ event_ids: eventIds, flagged },
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

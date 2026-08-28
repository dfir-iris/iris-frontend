/**
 * v2 service for the per-case named-timeline feature.
 *
 * Wraps `/api/v2/cases/{caseId}/timelines` (CRUD on timelines) plus
 * the helper that drives the sidebar selection in the case timeline
 * view. Event<->timeline membership is set via the existing
 * `case-timeline.service.ts` events endpoints by passing the optional
 * `timeline_ids` field.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface CaseTimeline {
	timeline_id: number;
	case_id: number;
	name: string;
	description: string | null;
	color: string | null;
	is_default: boolean;
	created_at: string | null;
	created_by_id: number | null;
}

export interface CreateCaseTimelineBody {
	name: string;
	description?: string | null;
	color?: string | null;
}

export interface UpdateCaseTimelineBody {
	name?: string;
	description?: string | null;
	color?: string | null;
}

export class CaseTimelinesService {
	static list(caseId: number, options: ApiOptions = {}): Promise<RequestResponse<CaseTimeline[]>> {
		return ApiService.get<CaseTimeline[]>(`/cases/${caseId}/timelines`, options);
	}

	static create(
		caseId: number,
		body: CreateCaseTimelineBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTimeline>> {
		return ApiService.post<CaseTimeline>(`/cases/${caseId}/timelines`, body, options);
	}

	static get(
		caseId: number,
		timelineId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTimeline>> {
		return ApiService.get<CaseTimeline>(`/cases/${caseId}/timelines/${timelineId}`, options);
	}

	static update(
		caseId: number,
		timelineId: number,
		body: UpdateCaseTimelineBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTimeline>> {
		return ApiService.put<CaseTimeline>(`/cases/${caseId}/timelines/${timelineId}`, body, options);
	}

	static remove(
		caseId: number,
		timelineId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/cases/${caseId}/timelines/${timelineId}`, options);
	}
}

/**
 * v2 service for the "Follow case" preference.
 *
 * Wraps `/api/v2/me/followed-cases` (list / add / remove) plus the
 * companion `/api/v2/cases/{id}/followers` for the case-detail
 * "people following this case" chip.
 *
 * All four calls go through `ApiService` so they inherit the bearer
 * token, refresh-on-401, and CSRF headers automatically.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { Case } from '$lib/types/resources/case';

export interface CaseFollower {
	user_id: number;
	user_login: string;
	user_name: string;
}

export interface FollowCaseResponse {
	case_id: number;
	followed: boolean;
}

export class FollowedCasesService {
	static listMine(options: ApiOptions = {}): Promise<RequestResponse<Case[]>> {
		return ApiService.get<Case[]>('/me/followed-cases', options);
	}

	static follow(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<FollowCaseResponse>> {
		return ApiService.post<FollowCaseResponse>('/me/followed-cases', { case_id: caseId }, options);
	}

	static unfollow(caseId: number, options: ApiOptions = {}): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/me/followed-cases/${caseId}`, options);
	}

	static listFollowers(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseFollower[]>> {
		return ApiService.get<CaseFollower[]>(`/cases/${caseId}/followers`, options);
	}
}

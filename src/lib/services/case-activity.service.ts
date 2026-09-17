import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

// Shape returned by `GET /api/v2/cases/{id}/activities`. The backend
// helper `search_users_activity_in_case` returns rows with `name`
// (not `user_name`), `activity_date`, `activity_desc` and `is_from_api`.
export interface CaseActivityRow {
	name?: string;
	user_name?: string;
	user_id?: number | null;
	activity_date?: string;
	activity_desc?: string;
	is_from_api?: boolean;
}

export class CaseActivityService {
	static async list(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseActivityRow[]>> {
		return ApiService.get<CaseActivityRow[]>(`/api/v2/cases/${caseId}/activities`, options);
	}

	// Manual log entry — the analyst records something they did outside
	// IRIS. Returns the created row in the same shape `list()` yields, so
	// callers can prepend it instead of re-listing. Needs full access on
	// the case.
	static async create(
		caseId: number,
		logContent: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseActivityRow>> {
		return ApiService.post<CaseActivityRow>(
			`/api/v2/cases/${caseId}/activities`,
			{ log_content: logContent },
			options
		);
	}
}

import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

// Shape returned by `GET /api/v2/cases/{id}/activities`. The backend
// helper `search_users_activity_in_case` returns rows with `name`
// (not `user_name`), `activity_date`, `activity_desc` and `is_from_api`.
export interface CaseActivityRow {
	name?: string;
	user_name?: string;
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
}

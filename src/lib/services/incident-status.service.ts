import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type IncidentStatus = {
	status_id: number;
	status_name: string;
	status_description?: string;
};

export class IncidentStatusService {
	// Small seeded table (Open / Investigating / Dismissed / Escalated).
	// per_page=10000 keeps parity with AlertStatusService and guards
	// against any custom deployments that seed additional statuses.
	static async list(options: ApiOptions = {}): Promise<RequestResponse<IncidentStatus[]>> {
		const url = ApiService.withQuery('/manage/incident-statuses', { per_page: 10000 });
		return ApiService.get<IncidentStatus[]>(url, options);
	}
}

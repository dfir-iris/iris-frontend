import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type AlertClusterStatus = {
	status_id: number;
	status_name: string;
	status_description?: string;
};

export class AlertClusterStatusService {
	// Small seeded table (Open / Investigating / Dismissed / Escalated).
	// per_page=10000 keeps parity with AlertStatusService and guards
	// against any custom deployments that seed additional statuses.
	static async list(options: ApiOptions = {}): Promise<RequestResponse<AlertClusterStatus[]>> {
		const url = ApiService.withQuery('/manage/alert-cluster-statuses', { per_page: 10000 });
		return ApiService.get<AlertClusterStatus[]>(url, options);
	}
}

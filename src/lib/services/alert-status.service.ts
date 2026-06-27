import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type AlertStatus = {
	status_id: number;
	status_name: string;
	status_description?: string;
};

export class AlertStatusService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<AlertStatus[]>> {
		// v2 paginates with default per_page=10; surface every status.
		const url = ApiService.withQuery('/manage/alert-statuses', { per_page: 10000 });
		return ApiService.get<AlertStatus[]>(url, options);
	}
}

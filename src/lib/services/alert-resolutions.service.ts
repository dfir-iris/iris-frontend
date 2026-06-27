import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type AlertResolution = {
	resolution_status_id: number;
	resolution_status_name: string;
	resolution_status_description?: string;
};

export class AlertResolutionService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<AlertResolution[]>> {
		// v2 paginates with default per_page=10; surface every resolution.
		const url = ApiService.withQuery('/manage/alert-resolutions', { per_page: 10000 });
		return ApiService.get<AlertResolution[]>(url, options);
	}
}

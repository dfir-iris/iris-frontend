import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type AlertResolution = {
	resolution_status_id: number;
	resolution_status_name: string;
	resolution_status_description?: string;
};

export class AlertResolutionService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<AlertResolution[]>> {
		return ApiService.get<AlertResolution[]>('/manage/alert-resolutions/list', options);
	}
}

import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type AlertStatus = {
	status_id: number;
	status_name: string;
	status_description?: string;
};

export class AlertStatusService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<AlertStatus[]>> {
		return ApiService.get<AlertStatus[]>('/manage/alert-statuses', options);
	}
}

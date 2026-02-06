import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type SeverityIdentifier = number;

export interface Severity {
	severity_id: number;
	severity_name: string;
	severity_description: string;
}

export class SeveritiesService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<Severity[]>> {
		return ApiService.get<Severity[]>(`/manage/severities/list`, options);
	}
}

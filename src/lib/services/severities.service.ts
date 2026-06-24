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
		// Hits the v2 read-only endpoint. The v2 surface returns a
		// paginated envelope (`{total, data, ...}`); consumers already
		// reach into `.data.data` to unwrap the legacy
		// `{status, data: T[]}` shape and get the same array.
		return ApiService.get<Severity[]>(`/manage/severities`, options);
	}
}

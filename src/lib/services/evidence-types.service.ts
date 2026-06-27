import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { EvidenceType } from '$lib/types/resources/evidence';

type ApiEnvelope<T> = {
	data: T;
	message?: string;
	status?: string;
};

export class EvidenceTypesService {
	static async list(options: ApiOptions = {}): Promise<RequestResponse<EvidenceType[]>> {
		// v2 paginates with default per_page=10; the evidence picker
		// must surface every type the deployment has configured.
		const url = ApiService.withQuery('/manage/case-objects/evidence-types', {
			per_page: 10000
		});
		const res = await ApiService.get<ApiEnvelope<EvidenceType[]>>(url, options);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			return { ...res, data: res.data.data };
		}

		return { ...res, data: [] };
	}
}

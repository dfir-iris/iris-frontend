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
		const res = await ApiService.get<ApiEnvelope<EvidenceType[]>>(
			'/manage/evidence-types/list',
			options
		);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			return { ...res, data: res.data.data };
		}

		return { ...res, data: [] };
	}
}

import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type AnalysisStatusIdentifier = number;

export type AnalysisStatusItem = {
	id: number;
	name: string;
};

type ApiEnvelope<T> = {
	data: T;
	message?: string;
	status?: string;
};

export class AnalysisStatusService {
	static async list(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AnalysisStatusItem[]>> {
		const path = ApiService.withQuery('/manage/analysis-status/list', { cid: caseId });
		const res = await ApiService.get<ApiEnvelope<AnalysisStatusItem[]>>(path, options);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			return { ...res, data: res.data.data };
		}

		return { ...res, data: [] };
	}

	static async get(
		analysisStatusId: AnalysisStatusIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<AnalysisStatusItem>> {
		const res = await ApiService.get<ApiEnvelope<AnalysisStatusItem>>(
			`/manage/analysis-status/${analysisStatusId}`,
			options
		);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			return { ...res, data: res.data.data };
		}

		return { ...res, data: null };
	}
}

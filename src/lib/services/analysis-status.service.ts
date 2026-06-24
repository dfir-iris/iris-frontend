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
	/**
	 * Lists the analysis-status rows. The legacy endpoint required a
	 * `cid` query param to scope the lookup; the v2 endpoint is
	 * case-agnostic (analysis statuses are global seed data), so the
	 * caseId arg is accepted-but-ignored for back-compat.
	 */
	static async list(
		_caseId?: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<AnalysisStatusItem[]>> {
		const res = await ApiService.get<ApiEnvelope<AnalysisStatusItem[]>>(
			'/manage/analysis-statuses',
			options
		);

		if (res.ok && res.data !== null && typeof res.data !== 'string') {
			return { ...res, data: res.data.data };
		}

		return { ...res, data: [] };
	}

	/**
	 * No bare get-by-id endpoint exists on v2 yet — every consumer
	 * grabs the full list and indexes locally. Keep the method as a
	 * shim that falls back to filtering the list, in case anything
	 * depends on the legacy shape; can be removed once no consumer
	 * calls it.
	 */
	static async get(
		analysisStatusId: AnalysisStatusIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<AnalysisStatusItem | null>> {
		const list = await AnalysisStatusService.list(undefined, options);
		if (!list.ok || !Array.isArray(list.data)) {
			return { ...list, data: null };
		}
		const found = list.data.find((s) => s.id === analysisStatusId) ?? null;
		return { ...list, data: found };
	}
}

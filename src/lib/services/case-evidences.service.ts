import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';
import type { Evidence } from '$lib/types/resources/evidence';

export type CaseEvidenceIdentifier = number;
export type SortDir = 'asc' | 'desc';

export interface ListCaseEvidencesParams {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: SortDir;
	custom_conditions?: string;
}

export interface CreateCaseEvidenceBody {
	filename: string;
	file_description?: string;
	file_hash?: string;
	file_size?: number;
	type_id?: number;
	acquisition_date?: string;
	start_date?: string;
	end_date?: string;
	chain_of_custody?: Record<string, unknown>;
	custom_attributes?: Record<string, unknown>;
}

export interface UpdateCaseEvidenceBody {
	filename?: string;
	file_description?: string;
	file_hash?: string;
	file_size?: number;
	type_id?: number;
	acquisition_date?: string;
	start_date?: string;
	end_date?: string;
	chain_of_custody?: Record<string, unknown>;
	custom_attributes?: Record<string, unknown>;
}

export class CaseEvidencesService {
	static async list(
		caseId: number,
		params: ListCaseEvidencesParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<Evidence>>> {
		const path = ApiService.withQuery(
			`/api/v2/cases/${caseId}/evidences`,
			params as Record<string, unknown>
		);

		return ApiService.get<Paginated<Evidence>>(path, options);
	}

	static async get(
		caseId: number,
		evidenceId: CaseEvidenceIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Evidence>> {
		return ApiService.get<Evidence>(`/api/v2/cases/${caseId}/evidences/${evidenceId}`, options);
	}

	static async create(
		caseId: number,
		body: CreateCaseEvidenceBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Evidence>> {
		return ApiService.post<Evidence>(`/api/v2/cases/${caseId}/evidences`, body, options);
	}

	static async update(
		caseId: number,
		evidenceId: CaseEvidenceIdentifier,
		body: UpdateCaseEvidenceBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Evidence>> {
		return ApiService.put<Evidence>(
			`/api/v2/cases/${caseId}/evidences/${evidenceId}`,
			body,
			options
		);
	}

	static async remove(
		caseId: number,
		evidenceId: CaseEvidenceIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/cases/${caseId}/evidences/${evidenceId}`, options);
	}
}

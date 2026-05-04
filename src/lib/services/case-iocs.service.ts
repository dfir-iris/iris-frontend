import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';
import type { Ioc } from '$lib/types/resources/ioc';

export type CaseIocIdentifier = number;
export type SortDir = 'asc' | 'desc';

export interface ListCaseIocsParams {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: SortDir;
	custom_conditions?: string;
}

export interface CreateCaseIocBody {
	ioc_value: string;
	ioc_type_id: number;
	ioc_tlp_id: number;
	ioc_description: string;
	ioc_misp?: string | null;
	ioc_tags: string;
}

export interface UpdateCaseIocBody {
	ioc_value?: string;
	ioc_type_id?: number;
	ioc_tlp_id?: number;
	ioc_description?: string;
	ioc_misp?: string | null;
	ioc_tags?: string;
}

export class CaseIocsService {
	static async list(
		caseId: number,
		params: ListCaseIocsParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<Ioc>>> {
		const path = ApiService.withQuery(
			`/api/v2/cases/${caseId}/iocs`,
			params as Record<string, unknown>
		);

		return ApiService.get<Paginated<Ioc>>(path, options);
	}

	static async get(
		caseId: number,
		iocId: CaseIocIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Ioc>> {
		return ApiService.get<Ioc>(`/api/v2/cases/${caseId}/iocs/${iocId}`, options);
	}

	static async getById(
		iocId: CaseIocIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Ioc>> {
		return ApiService.get<Ioc>(`/api/v2/iocs/${iocId}`, options);
	}

	static async create(
		caseId: number,
		body: CreateCaseIocBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Ioc>> {
		return ApiService.post<Ioc>(`/api/v2/cases/${caseId}/iocs`, body, options);
	}

	static async update(
		caseId: number,
		iocId: CaseIocIdentifier,
		body: UpdateCaseIocBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Ioc>> {
		return ApiService.put<Ioc>(`/api/v2/cases/${caseId}/iocs/${iocId}`, body, options);
	}

	static async updateById(
		iocId: CaseIocIdentifier,
		body: UpdateCaseIocBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Ioc>> {
		return ApiService.put<Ioc>(`/api/v2/iocs/${iocId}`, body, options);
	}

	static async remove(
		caseId: number,
		iocId: CaseIocIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/cases/${caseId}/iocs/${iocId}`, options);
	}

	static async removeById(
		iocId: CaseIocIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/iocs/${iocId}`, options);
	}
}

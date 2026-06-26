/**
 * Service for the cases-overview saved filters. Backs onto the
 * v2 `/api/v2/cases-filters` endpoints which mirror the alerts-filters
 * surface 1:1 — same shape, same private/public ownership rules,
 * same five verbs.
 *
 * `filter_data` is a serialised representation of the page's filter
 * state. To keep the service free of UI concerns, the caller decides
 * what to put in there (e.g. an array of FilterRow objects + a logic
 * operator + a quick-search string) and is responsible for round-
 * tripping it back when the user picks the saved filter from the
 * dropdown.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export type CasesFilterIdentifier = number;

export type CasesSavedFilter = {
	filter_id: number;
	filter_is_private: boolean;
	filter_type: 'cases';
	filter_name: string;
	filter_description?: string;
	filter_data: unknown;
	created_by?: number;
};

export type ListCasesSavedFiltersParams = {
	include_public?: 0 | 1;
};

export type CreateCasesSavedFilterBody = {
	filter_is_private: boolean;
	filter_name: string;
	filter_description?: string;
	filter_data: unknown;
};

export class CasesFiltersService {
	static async list(
		params: ListCasesSavedFiltersParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<CasesSavedFilter[]>> {
		const query: Record<string, unknown> = {
			include_public: params.include_public ?? 1
		};
		const path = ApiService.withQuery('/api/v2/cases-filters', query);
		return ApiService.get<CasesSavedFilter[]>(path, options);
	}

	static async get(
		id: CasesFilterIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CasesSavedFilter>> {
		return ApiService.get<CasesSavedFilter>(`/api/v2/cases-filters/${id}`, options);
	}

	static async create(
		body: CreateCasesSavedFilterBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CasesSavedFilter>> {
		return ApiService.post<CasesSavedFilter, CreateCasesSavedFilterBody>(
			`/api/v2/cases-filters`,
			body,
			options
		);
	}

	static async update(
		id: CasesFilterIdentifier,
		body: Partial<CreateCasesSavedFilterBody>,
		options: ApiOptions = {}
	): Promise<RequestResponse<CasesSavedFilter>> {
		return ApiService.put<CasesSavedFilter, Partial<CreateCasesSavedFilterBody>>(
			`/api/v2/cases-filters/${id}`,
			body,
			options
		);
	}

	static async remove(
		id: CasesFilterIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/cases-filters/${id}`, options);
	}
}

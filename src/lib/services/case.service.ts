import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse, Paginated } from './api.service';
import type { Case } from '$lib/types/resources/case';

export type CaseIdentifier = number;
export type SortDir = 'asc' | 'desc';

export interface ListCasesParams {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: SortDir;

	case_ids?: string | number[];

	case_customer_id?: number;
	case_name?: string;
	case_description?: string;
	classification_id?: number;
	case_owner_id?: number;
	case_opening_user_id?: number;
	severity_id?: number;
	case_state_id?: number;
	case_soc_id?: string;

	start_open_date?: string;
	end_open_date?: string;

	is_open?: boolean;
}

export interface CreateCaseBody {
	case_name: string;
	case_description: string;
	case_customer_id: number;
	case_soc_id: string;

	custom_attributes?: Record<string, unknown>;
	case_template_id?: number;
	classification_id?: number | null;
}

export interface UpdateCaseBody {
	case_name?: string;
	case_soc_id?: string;
	classification_id?: number;
	owner_id?: number;
	state_id?: number;
	severity_id?: number;
	status_id?: number;
	case_customer?: number;
	reviewer_id?: number;
	protagonists?: unknown[];
	case_tags?: string;
	custom_attributes?: Record<string, unknown>;
	case_description?: string;
}

export type CaseAccessLevel = 1 | 2 | 4;

export interface CaseAccessUserRow {
	user_id: number;
	user_name: string;
	user_login: string;
	user_access_level: CaseAccessLevel;
	user_email?: string;
}

export type FilterCasesParams = Omit<ListCasesParams, 'order_by' | 'is_open'>;

export type FilterCasesMessage = {
	total: number;
	cases: Case[];
	current_page?: number;
	last_page?: number;
	next_page?: number | null;
};

export class CaseService {
	static async list(
		params: ListCasesParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<Case>>> {
		const path = ApiService.withQuery('/api/v2/cases', params as Record<string, unknown>);

		return ApiService.get<Paginated<Case>>(path, options);
	}

	static async filter(
		params: FilterCasesParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<FilterCasesMessage>> {
		const query: Record<string, unknown> = {
			...params,
			case_ids: Array.isArray(params.case_ids) ? params.case_ids.join(',') : params.case_ids
		};

		const path = ApiService.withQuery('/manage/cases/filter', query);
		return ApiService.get<FilterCasesMessage>(path, options);
	}

	static async get(
		caseId: CaseIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Case>> {
		return ApiService.get<Case>(`/api/v2/cases/${caseId}`, options);
	}

	static async create(
		body: CreateCaseBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Case>> {
		return ApiService.post<Case>(`/api/v2/cases`, body, options);
	}

	static async update(
		caseId: CaseIdentifier,
		body: UpdateCaseBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Case>> {
		return ApiService.put<Case>(`/api/v2/cases/${caseId}`, body, options);
	}

	static async close(
		caseId: CaseIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.post<null>(`/manage/cases/close/${caseId}`, {}, options);
	}

	static async reopen(
		caseId: CaseIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.post<null>(`/manage/cases/reopen/${caseId}`, {}, options);
	}

	static async remove(
		caseId: CaseIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/cases/${caseId}`, options);
	}

	static async listAccessUsers(
		caseId: CaseIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseAccessUserRow[]>> {
		return ApiService.get<CaseAccessUserRow[]>(`/api/v2/cases/${caseId}/access/users`, options);
	}
}

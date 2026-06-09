import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';
import type { Task } from '$lib/types/resources/task';

export type CaseTaskIdentifier = number;
export type SortDir = 'asc' | 'desc';

export interface ListCaseTasksParams {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: SortDir;
	custom_conditions?: string;
}

export interface CreateCaseTaskBody {
	task_title: string;
	task_status_id: number;
	task_assignees_id: number[];
	task_description?: string;
	task_tags?: string;
	custom_attributes?: Record<string, unknown>;
}

export interface UpdateCaseTaskBody {
	task_title?: string;
	task_status_id?: number;
	task_assignees_id?: number[];
	task_description?: string;
	task_tags?: string;
	custom_attributes?: Record<string, unknown>;
}

export class CaseTasksService {
	static async list(
		caseId: number,
		params: ListCaseTasksParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<Task>>> {
		const path = ApiService.withQuery(
			`/api/v2/cases/${caseId}/tasks`,
			params as Record<string, unknown>
		);

		return ApiService.get<Paginated<Task>>(path, options);
	}

	static async get(
		caseId: number,
		taskId: CaseTaskIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Task>> {
		return ApiService.get<Task>(`/api/v2/cases/${caseId}/tasks/${taskId}`, options);
	}

	static async getById(
		taskId: CaseTaskIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Task>> {
		return ApiService.get<Task>(`/api/v2/tasks/${taskId}`, options);
	}

	static async create(
		caseId: number,
		body: CreateCaseTaskBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Task>> {
		return ApiService.post<Task>(`/api/v2/cases/${caseId}/tasks`, body, options);
	}

	static async update(
		caseId: number,
		taskId: CaseTaskIdentifier,
		body: UpdateCaseTaskBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Task>> {
		return ApiService.put<Task>(`/api/v2/cases/${caseId}/tasks/${taskId}`, body, options);
	}

	static async remove(
		caseId: number,
		taskId: CaseTaskIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/cases/${caseId}/tasks/${taskId}`, options);
	}

	static async removeById(
		taskId: CaseTaskIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/tasks/${taskId}`, options);
	}
}

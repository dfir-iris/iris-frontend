import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';

// Row shape returned by `GET /api/v2/dim-tasks`. Mirrors the projection
// in `app/business/asynchronous_tasks.py::_project_row`.
export interface DimTaskRow {
	task_id: string;
	state: string;
	case: string;
	case_id: number | null;
	module: string | null;
	// ISO 8601 string, or `null` for a task that hasn't finished yet.
	date_done: string | null;
	user: string;
}

// Detail payload from `GET /api/v2/dim-tasks/<task_id>`. The `details`
// dict is a free-form key/value map (legacy contract from
// `dim_tasks_get`), rendered verbatim in the side panel.
export interface DimTaskDetailEnvelope {
	row: DimTaskRow;
	details: Record<string, unknown>;
}

export interface ListDimTasksParams {
	page?: number;
	per_page?: number;
	search?: string;
	// Exact Celery status (SUCCESS / FAILURE / PENDING / STARTED / RETRY).
	status?: string;
}

export class DimTasksService {
	static async list(
		params: ListDimTasksParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<DimTaskRow>>> {
		const query: Record<string, unknown> = {
			page: params.page,
			per_page: params.per_page,
			search: params.search?.trim() || undefined,
			status: params.status || undefined
		};
		const path = ApiService.withQuery('/api/v2/dim-tasks', query);
		return ApiService.get<Paginated<DimTaskRow>>(path, options);
	}

	static async get(
		taskId: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<DimTaskDetailEnvelope>> {
		return ApiService.get<DimTaskDetailEnvelope>(
			`/api/v2/dim-tasks/${encodeURIComponent(taskId)}`,
			options
		);
	}
}

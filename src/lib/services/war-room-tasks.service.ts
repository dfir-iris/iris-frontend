/** War-room tasks REST wrapper. */
import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';

export interface WarRoomTask {
	task_id: number;
	war_room_id: number;
	title: string;
	description: string | null;
	status_id: number | null;
	status_name?: string | null;
	status_bscolor?: string | null;
	assignee_id: number | null;
	assignee_login: string | null;
	assignee_name: string | null;
	due_at: string | null;
	source_case_id: number | null;
	source_case_task_id: number | null;
	created_at: string | null;
	created_by_id: number | null;
	created_by_login?: string | null;
	created_by_name?: string | null;
	closed_at: string | null;
	closed_by_id: number | null;
	closed_by_login?: string | null;
	closed_by_name?: string | null;
	tags: string | null;
	parent_task_id?: number | null;
}

export interface CreateWarRoomTaskBody {
	title: string;
	description?: string | null;
	status_id?: number | null;
	assignee_id?: number | null;
	due_at?: string | null;
	source_case_id?: number | null;
	source_case_task_id?: number | null;
	tags?: string | null;
	parent_task_id?: number | null;
}

export interface UpdateWarRoomTaskBody {
	title?: string;
	description?: string | null;
	status_id?: number | null;
	assignee_id?: number | null;
	due_at?: string | null;
	source_case_id?: number | null;
	source_case_task_id?: number | null;
	tags?: string | null;
	parent_task_id?: number | null;
}

export interface ListWarRoomTasksParams {
	q?: string;
	status_id?: number[];
	tag?: string[];
	assignee_id?: (number | 'unassigned')[];
	parent_task_id?: number | 'top' | null;
	include_closed?: boolean;
	/** ISO date/datetime string; keeps only tasks with due_at >= this. */
	due_from?: string;
	/** ISO date/datetime string; keeps only tasks with due_at <= this. */
	due_to?: string;
	/**
	 * When a due-date filter is active, also keep tasks with no due
	 * date (default true — matches the backend so "due this week"
	 * doesn't silently drop the untriaged backlog).
	 */
	include_no_due?: boolean;
	page?: number;
	per_page?: number;
}

function buildListQuery(params: ListWarRoomTasksParams = {}): string {
	const qs = new URLSearchParams();
	if (params.q) qs.set('q', params.q);
	if (params.status_id?.length) {
		for (const s of params.status_id) qs.append('status_id', String(s));
	}
	if (params.tag?.length) {
		for (const t of params.tag) qs.append('tag', t);
	}
	if (params.assignee_id?.length) {
		for (const a of params.assignee_id) qs.append('assignee_id', String(a));
	}
	if (params.parent_task_id !== undefined) {
		qs.set(
			'parent_task_id',
			params.parent_task_id === null ? 'top' : String(params.parent_task_id)
		);
	}
	if (params.include_closed === false) qs.set('include_closed', 'false');
	if (params.due_from) qs.set('due_from', params.due_from);
	if (params.due_to) qs.set('due_to', params.due_to);
	if (params.include_no_due === false) qs.set('include_no_due', 'false');
	if (params.page !== undefined) qs.set('page', String(params.page));
	if (params.per_page !== undefined) qs.set('per_page', String(params.per_page));
	const s = qs.toString();
	return s ? `?${s}` : '';
}

export class WarRoomTasksService {
	static list(
		warRoomId: number,
		params: ListWarRoomTasksParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTask[]>> {
		// Drop pagination params from the array-shaped call so callers
		// can't accidentally trigger the envelope-shaped response.
		const flat = { ...params };
		delete flat.page;
		delete flat.per_page;
		const suffix = buildListQuery(flat);
		return ApiService.get<WarRoomTask[]>(
			`/war-rooms/${warRoomId}/tasks${suffix}`,
			options
		);
	}

	static listPaginated(
		warRoomId: number,
		params: ListWarRoomTasksParams & { page: number; per_page?: number },
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<WarRoomTask>>> {
		const suffix = buildListQuery(params);
		return ApiService.get<Paginated<WarRoomTask>>(
			`/war-rooms/${warRoomId}/tasks${suffix}`,
			options
		);
	}

	static listUsedTags(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<string[]>> {
		return ApiService.get<string[]>(`/war-rooms/${warRoomId}/tasks/tags`, options);
	}

	static create(
		warRoomId: number,
		body: CreateWarRoomTaskBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTask>> {
		return ApiService.post(`/war-rooms/${warRoomId}/tasks`, body, options);
	}

	static update(
		warRoomId: number,
		taskId: number,
		body: UpdateWarRoomTaskBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTask>> {
		return ApiService.patch(`/war-rooms/${warRoomId}/tasks/${taskId}`, body, options);
	}

	static close(
		warRoomId: number,
		taskId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTask>> {
		return ApiService.post(`/war-rooms/${warRoomId}/tasks/${taskId}/close`, {}, options);
	}

	static reopen(
		warRoomId: number,
		taskId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTask>> {
		return ApiService.post(`/war-rooms/${warRoomId}/tasks/${taskId}/reopen`, {}, options);
	}

	static remove(
		warRoomId: number,
		taskId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/war-rooms/${warRoomId}/tasks/${taskId}`, options);
	}
}

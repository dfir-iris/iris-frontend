/** War-room tasks REST wrapper. */
import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';

/** A war-room team a task is assigned to, as embedded in task payloads. */
export interface WarRoomTaskTeam {
	team_id: number;
	name: string;
	color: string | null;
}

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
	/**
	 * Teams of the room the task is assigned to, sorted by name. Sits
	 * alongside the single person assignee — a task can have both.
	 */
	teams: WarRoomTaskTeam[];
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
	/** Teams of the room to assign; unknown / foreign teams are a 400. */
	team_ids?: number[];
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
	/** Replaces the team set; `[]` clears it, omit to leave it alone. */
	team_ids?: number[];
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
	/** Team ids; `'none'` keeps tasks with no team. */
	team_id?: (number | 'none')[];
	/** Tasks assigned to the caller or to any team the caller is in. */
	mine?: boolean;
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

/** Per-case outcome of a fan-out request. */
export type WarRoomTaskFanOutStatus = 'created' | 'exists' | 'denied' | 'error';

export interface WarRoomTaskFanOutBody {
	case_ids: number[];
	/** Assign each case task to its case owner (backend default: true). */
	assign_to_case_owner?: boolean;
	status_id?: number | null;
}

export interface WarRoomTaskFanOutResult {
	case_id: number;
	status: WarRoomTaskFanOutStatus;
	case_task_id?: number;
	message?: string;
}

export interface WarRoomTaskFanOutResponse {
	results: WarRoomTaskFanOutResult[];
}

/**
 * One case a war-room task was fanned out to. Cases the caller cannot
 * read come back as `{case_id, accessible: false, created_at}` only.
 */
export interface WarRoomTaskFanOutLink {
	case_id: number;
	accessible: boolean;
	case_name?: string | null;
	case_task_id?: number | null;
	task_title?: string | null;
	status_id?: number | null;
	status_name?: string | null;
	done?: boolean;
	assignees?: { id: number; name: string }[];
	created_at: string | null;
}

export interface WarRoomTaskFanOutSummaryEntry {
	total: number;
	done: number;
	accessible_total: number;
}

/** Keyed by war-room task id (as a string — JSON object keys). */
export type WarRoomTaskFanOutSummary = Record<string, WarRoomTaskFanOutSummaryEntry>;

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
	if (params.team_id?.length) {
		for (const t of params.team_id) qs.append('team_id', String(t));
	}
	if (params.mine) qs.set('mine', '1');
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
		return ApiService.get<WarRoomTask[]>(`/war-rooms/${warRoomId}/tasks${suffix}`, options);
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

	/** Create one linked case task per target case. */
	static fanOut(
		warRoomId: number,
		taskId: number,
		body: WarRoomTaskFanOutBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTaskFanOutResponse>> {
		return ApiService.post(`/war-rooms/${warRoomId}/tasks/${taskId}/fan-out`, body, options);
	}

	/** Per-case status of a fanned-out task. */
	static fanOutStatus(
		warRoomId: number,
		taskId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTaskFanOutLink[]>> {
		return ApiService.get(`/war-rooms/${warRoomId}/tasks/${taskId}/fan-out`, options);
	}

	/** Done/total roll-up for every room task that has case links. */
	static fanOutSummary(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTaskFanOutSummary>> {
		return ApiService.get(`/war-rooms/${warRoomId}/tasks/fan-out-summary`, options);
	}

	/** Drop the link to a case; the case task itself stays. */
	static unlinkFanOut(
		warRoomId: number,
		taskId: number,
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/war-rooms/${warRoomId}/tasks/${taskId}/fan-out/${caseId}`,
			options
		);
	}
}

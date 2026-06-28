/** War-room tasks REST wrapper. */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface WarRoomTask {
	task_id: number;
	war_room_id: number;
	title: string;
	description: string | null;
	status_id: number | null;
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
}

export class WarRoomTasksService {
	static list(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomTask[]>> {
		return ApiService.get<WarRoomTask[]>(`/war-rooms/${warRoomId}/tasks`, options);
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

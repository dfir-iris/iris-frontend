/** War-room notes REST wrapper. */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface WarRoomNote {
	note_id: number;
	war_room_id: number;
	title: string;
	content: string | null;
	created_at: string | null;
	updated_at: string | null;
	created_by_id: number | null;
	updated_by_id: number | null;
}

export class WarRoomNotesService {
	static list(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomNote[]>> {
		return ApiService.get<WarRoomNote[]>(`/war-rooms/${warRoomId}/notes`, options);
	}

	static get(
		warRoomId: number,
		noteId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomNote>> {
		return ApiService.get(`/war-rooms/${warRoomId}/notes/${noteId}`, options);
	}

	static create(
		warRoomId: number,
		body: { title: string; content?: string | null },
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomNote>> {
		return ApiService.post(`/war-rooms/${warRoomId}/notes`, body, options);
	}

	static update(
		warRoomId: number,
		noteId: number,
		body: { title?: string; content?: string | null },
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomNote>> {
		return ApiService.patch(`/war-rooms/${warRoomId}/notes/${noteId}`, body, options);
	}

	static remove(
		warRoomId: number,
		noteId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/war-rooms/${warRoomId}/notes/${noteId}`, options);
	}
}

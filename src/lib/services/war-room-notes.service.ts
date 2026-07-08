/** War-room notes REST wrapper.
 *
 * Mirrors `CaseNotesService` — folder tree + notes + revision history.
 * Case notes call folders "directories" (legacy term); war-room notes
 * call them "folders" everywhere since this is greenfield and the UI
 * already uses that word. */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface WarRoomNote {
	note_id: number;
	war_room_id: number;
	folder_id: number | null;
	title: string;
	content: string | null;
	created_at: string | null;
	updated_at: string | null;
	created_by_id: number | null;
	updated_by_id: number | null;
}

export interface WarRoomNoteFolder {
	id: number;
	name: string;
	war_room_id: number;
	parent_id: number | null;
	created_at: string | null;
	updated_at: string | null;
}

export interface WarRoomNoteRevisionSummary {
	revision_number: number;
	revised_at: string | null;
	user_name: string | null;
}

export interface WarRoomNoteRevision {
	revision_number: number;
	title: string | null;
	content: string | null;
	revised_at: string | null;
	revised_by_id: number | null;
}

export interface CreateWarRoomNoteBody {
	title: string;
	content?: string | null;
	folder_id?: number | null;
}

export interface UpdateWarRoomNoteBody {
	title?: string;
	content?: string | null;
	// Omit the key to leave the folder alone; set to `null` to move to root.
	folder_id?: number | null;
}

export interface CreateWarRoomNoteFolderBody {
	name: string;
	parent_id?: number | null;
}

export interface UpdateWarRoomNoteFolderBody {
	name?: string;
	parent_id?: number | null;
}

export class WarRoomNotesService {
	// ---- Notes --------------------------------------------------------

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
		body: CreateWarRoomNoteBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomNote>> {
		return ApiService.post(`/war-rooms/${warRoomId}/notes`, body, options);
	}

	static update(
		warRoomId: number,
		noteId: number,
		body: UpdateWarRoomNoteBody,
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

	// ---- Folders ------------------------------------------------------

	static listFolders(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomNoteFolder[]>> {
		return ApiService.get<WarRoomNoteFolder[]>(
			`/war-rooms/${warRoomId}/notes-folders`,
			options
		);
	}

	static getFolder(
		warRoomId: number,
		folderId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomNoteFolder>> {
		return ApiService.get<WarRoomNoteFolder>(
			`/war-rooms/${warRoomId}/notes-folders/${folderId}`,
			options
		);
	}

	static createFolder(
		warRoomId: number,
		body: CreateWarRoomNoteFolderBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomNoteFolder>> {
		return ApiService.post<WarRoomNoteFolder>(
			`/war-rooms/${warRoomId}/notes-folders`,
			body,
			options
		);
	}

	static updateFolder(
		warRoomId: number,
		folderId: number,
		body: UpdateWarRoomNoteFolderBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomNoteFolder>> {
		return ApiService.put<WarRoomNoteFolder>(
			`/war-rooms/${warRoomId}/notes-folders/${folderId}`,
			body,
			options
		);
	}

	static removeFolder(
		warRoomId: number,
		folderId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/war-rooms/${warRoomId}/notes-folders/${folderId}`,
			options
		);
	}

	// ---- Revisions ----------------------------------------------------

	static listRevisions(
		warRoomId: number,
		noteId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomNoteRevisionSummary[]>> {
		return ApiService.get<WarRoomNoteRevisionSummary[]>(
			`/war-rooms/${warRoomId}/notes/${noteId}/revisions`,
			options
		);
	}

	static getRevision(
		warRoomId: number,
		noteId: number,
		revisionNumber: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomNoteRevision>> {
		return ApiService.get<WarRoomNoteRevision>(
			`/war-rooms/${warRoomId}/notes/${noteId}/revisions/${revisionNumber}`,
			options
		);
	}

	static restoreRevision(
		warRoomId: number,
		noteId: number,
		revisionNumber: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomNote>> {
		return ApiService.post<WarRoomNote>(
			`/war-rooms/${warRoomId}/notes/${noteId}/revisions/${revisionNumber}/restore`,
			{},
			options
		);
	}

	static deleteRevision(
		warRoomId: number,
		noteId: number,
		revisionNumber: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/war-rooms/${warRoomId}/notes/${noteId}/revisions/${revisionNumber}`,
			options
		);
	}
}

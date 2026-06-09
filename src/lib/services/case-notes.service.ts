import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';
import type { Note, NoteFolder } from '$lib/types/resources/note';

export type CaseNoteIdentifier = number;
export type NoteDirectoryIdentifier = number;

export interface CreateCaseNoteBody {
	note_title?: string;
	note_content?: string;
	directory_id: number;
}

export interface UpdateCaseNoteBody {
	note_title?: string;
	note_content?: string;
	directory_id?: number;
}

export interface CreateNoteDirectoryBody {
	name: string;
	parent_id?: number;
}

export interface UpdateNoteDirectoryBody {
	name?: string;
	parent_id?: number;
}

export interface ListCaseNotesParams {
	search_input?: string;
}

export class CaseNotesService {
	static async listDirectories(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<NoteFolder>>> {
		return ApiService.get<Paginated<NoteFolder>>(
			`/api/v2/cases/${caseId}/notes-directories`,
			options
		);
	}

	static async listNotes(
		caseId: number,
		params: ListCaseNotesParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Note[]>> {
		const path = ApiService.withQuery(
			`/api/v2/cases/${caseId}/notes`,
			params as Record<string, unknown>
		);

		return ApiService.get<Note[]>(path, options);
	}

	static async searchNotes(
		caseId: number,
		searchInput: string,
		options: ApiOptions = {}
	): Promise<RequestResponse<Note[]>> {
		const path = ApiService.withQuery(`/api/v2/cases/${caseId}/notes/search`, {
			search_input: searchInput
		});

		return ApiService.get<Note[]>(path, options);
	}

	static async getDirectory(
		caseId: number,
		directoryId: NoteDirectoryIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<NoteFolder>> {
		return ApiService.get<NoteFolder>(
			`/api/v2/cases/${caseId}/notes-directories/${directoryId}`,
			options
		);
	}

	static async createDirectory(
		caseId: number,
		body: CreateNoteDirectoryBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<NoteFolder>> {
		return ApiService.post<NoteFolder>(`/api/v2/cases/${caseId}/notes-directories`, body, options);
	}

	static async updateDirectory(
		caseId: number,
		directoryId: NoteDirectoryIdentifier,
		body: UpdateNoteDirectoryBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<NoteFolder>> {
		return ApiService.put<NoteFolder>(
			`/api/v2/cases/${caseId}/notes-directories/${directoryId}`,
			body,
			options
		);
	}

	static async removeDirectory(
		caseId: number,
		directoryId: NoteDirectoryIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(
			`/api/v2/cases/${caseId}/notes-directories/${directoryId}`,
			options
		);
	}

	static async getNote(
		caseId: number,
		noteId: CaseNoteIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<Note>> {
		return ApiService.get<Note>(`/api/v2/cases/${caseId}/notes/${noteId}`, options);
	}

	static async createNote(
		caseId: number,
		body: CreateCaseNoteBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Note>> {
		return ApiService.post<Note>(`/api/v2/cases/${caseId}/notes`, body, options);
	}

	static async updateNote(
		caseId: number,
		noteId: CaseNoteIdentifier,
		body: UpdateCaseNoteBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Note>> {
		return ApiService.put<Note>(`/api/v2/cases/${caseId}/notes/${noteId}`, body, options);
	}

	static async removeNote(
		caseId: number,
		noteId: CaseNoteIdentifier,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete<null>(`/api/v2/cases/${caseId}/notes/${noteId}`, options);
	}
}

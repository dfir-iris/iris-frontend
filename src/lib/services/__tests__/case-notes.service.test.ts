import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { CaseNotesService } from '../case-notes.service';
import { ApiService } from '../api.service';

import type { ApiOptions, Paginated } from '../api.service';
import type { Note, NoteFolder } from '$lib/types/resources/note';
import type {
	CreateCaseNoteBody,
	UpdateCaseNoteBody,
	CreateNoteDirectoryBody,
	UpdateNoteDirectoryBody
} from '../case-notes.service';

describe('CaseNotesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('listDirectories() should call ApiService.get with /api/v2/cases/{caseId}/notes-directories + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				total: 1,
				data: [
					{
						id: 5,
						name: 'Folder A',
						note_count: 1,
						subdirectories: [],
						notes: []
					} as NoteFolder
				],
				last_page: 1,
				current_page: 1,
				next_page: null
			} satisfies Paginated<NoteFolder>
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseNotesService.listDirectories(73, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/73/notes-directories', options);
		expect(res).toBe(mockResponse);
	});

	it('getDirectory() should call ApiService.get with /api/v2/cases/{caseId}/notes-directories/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				id: 5,
				name: 'Folder A',
				note_count: 1,
				subdirectories: [],
				notes: []
			} as NoteFolder
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseNotesService.getDirectory(73, 5, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/73/notes-directories/5', options);
		expect(res).toBe(mockResponse);
	});

	it('createDirectory() should call ApiService.post with /api/v2/cases/{caseId}/notes-directories, body, options', async () => {
		const body: CreateNoteDirectoryBody = {
			name: 'Folder A',
			parent_id: 2
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 201,
			data: {
				id: 5,
				name: 'Folder A',
				note_count: 0,
				subdirectories: [],
				notes: []
			} as NoteFolder
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseNotesService.createDirectory(73, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith(
			'/api/v2/cases/73/notes-directories',
			body,
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('updateDirectory() should call ApiService.put with /api/v2/cases/{caseId}/notes-directories/{id}, body, options', async () => {
		const body: UpdateNoteDirectoryBody = {
			name: 'Renamed Folder',
			parent_id: 3
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				id: 5,
				name: 'Renamed Folder',
				note_count: 0,
				subdirectories: [],
				notes: []
			} as NoteFolder
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseNotesService.updateDirectory(73, 5, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith(
			'/api/v2/cases/73/notes-directories/5',
			body,
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('removeDirectory() should call ApiService.delete with /api/v2/cases/{caseId}/notes-directories/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseNotesService.removeDirectory(73, 5, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/73/notes-directories/5', options);
		expect(res).toBe(mockResponse);
	});

	it('getNote() should call ApiService.get with /api/v2/cases/{caseId}/notes/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				note_id: 11,
				note_title: 'New note',
				note_content: 'Content',
				directory_id: 5
			} as Note
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseNotesService.getNote(73, 11, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/73/notes/11', options);
		expect(res).toBe(mockResponse);
	});

	it('createNote() should call ApiService.post with /api/v2/cases/{caseId}/notes, body, options', async () => {
		const body: CreateCaseNoteBody = {
			note_title: 'New note',
			note_content: 'Content',
			directory_id: 5
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 201,
			data: {
				note_id: 11,
				note_title: 'New note',
				note_content: 'Content',
				directory_id: 5
			} as Note
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseNotesService.createNote(73, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/73/notes', body, options);
		expect(res).toBe(mockResponse);
	});

	it('updateNote() should call ApiService.put with /api/v2/cases/{caseId}/notes/{id}, body, options', async () => {
		const body: UpdateCaseNoteBody = {
			note_title: 'Updated title',
			note_content: 'Updated content',
			directory_id: 6
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				note_id: 11,
				note_title: 'Updated title',
				note_content: 'Updated content',
				directory_id: 6
			} as Note
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseNotesService.updateNote(73, 11, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/api/v2/cases/73/notes/11', body, options);
		expect(res).toBe(mockResponse);
	});

	it('removeNote() should call ApiService.delete with /api/v2/cases/{caseId}/notes/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseNotesService.removeNote(73, 11, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/73/notes/11', options);
		expect(res).toBe(mockResponse);
	});
});

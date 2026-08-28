import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn()
	}
}));

import { WarRoomNotesService } from '../war-room-notes.service';
import { ApiService } from '../api.service';

const mock = (method: keyof typeof ApiService) =>
	ApiService[method] as unknown as ReturnType<typeof vi.fn>;

describe('WarRoomNotesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ---- Notes -------------------------------------------------------------

	describe('list()', () => {
		it('GETs /war-rooms/:warRoomId/notes', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			const result = await WarRoomNotesService.list(5);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/5/notes', {});
			expect(result).toEqual({ ok: true, data: [] });
		});

		it('forwards ApiOptions', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			const opts = { signal: new AbortController().signal };
			await WarRoomNotesService.list(5, opts);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/5/notes', opts);
		});
	});

	describe('get()', () => {
		it('GETs /war-rooms/:warRoomId/notes/:noteId', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: { note_id: 10 } });
			const result = await WarRoomNotesService.get(5, 10);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/5/notes/10', {});
			expect(result).toEqual({ ok: true, data: { note_id: 10 } });
		});
	});

	describe('create()', () => {
		it('POSTs to /war-rooms/:warRoomId/notes with the supplied body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { note_id: 11 } });
			const body = { title: 'My Note', content: 'details', folder_id: null };
			const result = await WarRoomNotesService.create(5, body);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/5/notes', body, {});
			expect(result).toEqual({ ok: true, data: { note_id: 11 } });
		});

		it('accepts a body with only a title', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { note_id: 12 } });
			await WarRoomNotesService.create(5, { title: 'Minimal' });
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/5/notes', { title: 'Minimal' }, {});
		});
	});

	describe('update()', () => {
		it('PATCHes /war-rooms/:warRoomId/notes/:noteId with the supplied body', async () => {
			mock('patch').mockResolvedValueOnce({ ok: true, data: { note_id: 10 } });
			const body = { title: 'Updated', folder_id: 2 };
			const result = await WarRoomNotesService.update(5, 10, body);
			expect(ApiService.patch).toHaveBeenCalledWith('/war-rooms/5/notes/10', body, {});
			expect(result).toEqual({ ok: true, data: { note_id: 10 } });
		});

		it('does NOT call ApiService.put', async () => {
			mock('patch').mockResolvedValueOnce({ ok: true, data: {} });
			await WarRoomNotesService.update(5, 10, { content: 'x' });
			expect(ApiService.put).not.toHaveBeenCalled();
		});

		it('can move a note to root by passing folder_id: null', async () => {
			mock('patch').mockResolvedValueOnce({ ok: true, data: {} });
			await WarRoomNotesService.update(5, 10, { folder_id: null });
			expect(ApiService.patch).toHaveBeenCalledWith(
				'/war-rooms/5/notes/10',
				{ folder_id: null },
				{}
			);
		});
	});

	describe('remove()', () => {
		it('DELETEs /war-rooms/:warRoomId/notes/:noteId', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, data: null });
			const result = await WarRoomNotesService.remove(5, 10);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/5/notes/10', {});
			expect(result).toEqual({ ok: true, data: null });
		});
	});

	// ---- Folders -----------------------------------------------------------

	describe('listFolders()', () => {
		it('GETs /war-rooms/:warRoomId/notes-folders', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomNotesService.listFolders(5);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/5/notes-folders', {});
		});
	});

	describe('getFolder()', () => {
		it('GETs /war-rooms/:warRoomId/notes-folders/:folderId', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: { id: 3 } });
			const result = await WarRoomNotesService.getFolder(5, 3);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/5/notes-folders/3', {});
			expect(result).toEqual({ ok: true, data: { id: 3 } });
		});
	});

	describe('createFolder()', () => {
		it('POSTs to /war-rooms/:warRoomId/notes-folders with the supplied body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { id: 4 } });
			const body = { name: 'New Folder', parent_id: null };
			await WarRoomNotesService.createFolder(5, body);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/5/notes-folders', body, {});
		});

		it('accepts a body with only a name', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { id: 5 } });
			await WarRoomNotesService.createFolder(5, { name: 'Root Folder' });
			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/5/notes-folders',
				{ name: 'Root Folder' },
				{}
			);
		});
	});

	describe('updateFolder()', () => {
		it('PUTs to /war-rooms/:warRoomId/notes-folders/:folderId — NOT patch', async () => {
			mock('put').mockResolvedValueOnce({ ok: true, data: { id: 3 } });
			const body = { name: 'Renamed', parent_id: 1 };
			const result = await WarRoomNotesService.updateFolder(5, 3, body);
			expect(ApiService.put).toHaveBeenCalledWith('/war-rooms/5/notes-folders/3', body, {});
			expect(result).toEqual({ ok: true, data: { id: 3 } });
		});

		it('does NOT call ApiService.patch', async () => {
			mock('put').mockResolvedValueOnce({ ok: true, data: {} });
			await WarRoomNotesService.updateFolder(5, 3, { name: 'x' });
			expect(ApiService.patch).not.toHaveBeenCalled();
		});
	});

	describe('removeFolder()', () => {
		it('DELETEs /war-rooms/:warRoomId/notes-folders/:folderId', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, data: null });
			await WarRoomNotesService.removeFolder(5, 3);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/5/notes-folders/3', {});
		});
	});

	// ---- Revisions ---------------------------------------------------------

	describe('listRevisions()', () => {
		it('GETs /war-rooms/:warRoomId/notes/:noteId/revisions', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomNotesService.listRevisions(5, 10);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/5/notes/10/revisions', {});
		});
	});

	describe('getRevision()', () => {
		it('GETs /war-rooms/:warRoomId/notes/:noteId/revisions/:revisionNumber', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: { revision_number: 2 } });
			const result = await WarRoomNotesService.getRevision(5, 10, 2);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/5/notes/10/revisions/2', {});
			expect(result).toEqual({ ok: true, data: { revision_number: 2 } });
		});
	});

	describe('restoreRevision()', () => {
		it('POSTs to /war-rooms/:warRoomId/notes/:noteId/revisions/:revisionNumber/restore with an empty body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { note_id: 10 } });
			const result = await WarRoomNotesService.restoreRevision(5, 10, 2);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/5/notes/10/revisions/2/restore',
				{},
				{}
			);
			expect(result).toEqual({ ok: true, data: { note_id: 10 } });
		});
	});

	describe('deleteRevision()', () => {
		it('DELETEs /war-rooms/:warRoomId/notes/:noteId/revisions/:revisionNumber', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, data: null });
			await WarRoomNotesService.deleteRevision(5, 10, 2);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/5/notes/10/revisions/2', {});
		});
	});
});

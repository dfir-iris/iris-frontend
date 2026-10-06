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

import {
	WarRoomNoteSharesService,
	buildNoteShareIndex,
	noteShareBadgeLabel,
	type NoteShare
} from '../war-room-note-shares.service';
import { ApiService } from '../api.service';

const mock = (method: keyof typeof ApiService) =>
	ApiService[method] as unknown as ReturnType<typeof vi.fn>;

// Minimal stand-in for ApiService.withQuery so URL assertions are real.
const fakeWithQuery = (path: string, params: Record<string, unknown>) => {
	const qs = Object.entries(params)
		.filter(([, v]) => v !== undefined && v !== null)
		.map(([k, v]) => `${k}=${String(v)}`)
		.join('&');
	return qs ? `${path}?${qs}` : path;
};

const share = (overrides: Partial<NoteShare> = {}): NoteShare => ({
	share_id: 1,
	war_room_id: 5,
	note_id: 10,
	folder_id: null,
	target_title: 'Note',
	scope: 'cases',
	include_future: false,
	delivery: 'mirror',
	case_ids: [1],
	created_at: null,
	created_by_id: null,
	created_by_name: null,
	updated_at: null,
	targets: [{ case_id: 1, accessible: true, status: 'synced', mirror_note_id: 100 }],
	customers: [],
	...overrides
});

describe('WarRoomNoteSharesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mock('withQuery').mockImplementation(fakeWithQuery);
	});

	describe('list()', () => {
		it('GETs /war-rooms/:id/note-shares without filter', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			const res = await WarRoomNoteSharesService.list(5);
			expect(ApiService.withQuery).toHaveBeenCalledWith('/war-rooms/5/note-shares', {});
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/5/note-shares', {});
			expect(res).toEqual({ ok: true, data: [] });
		});

		it('forwards the note_id / folder_id filter as query params', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomNoteSharesService.list(5, { note_id: 10 });
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/5/note-shares?note_id=10', {});

			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomNoteSharesService.list(5, { folder_id: 3 });
			expect(ApiService.get).toHaveBeenLastCalledWith('/war-rooms/5/note-shares?folder_id=3', {});
		});

		it('forwards ApiOptions', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			const opts = { signal: new AbortController().signal };
			await WarRoomNoteSharesService.list(5, {}, opts);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/5/note-shares', opts);
		});
	});

	describe('create()', () => {
		it('POSTs the body to /war-rooms/:id/note-shares', async () => {
			const body = {
				note_id: 10,
				scope: 'cases' as const,
				case_ids: [1, 2],
				include_future: true,
				delivery: 'mirror' as const
			};
			mock('post').mockResolvedValueOnce({ ok: true, data: share() });
			const res = await WarRoomNoteSharesService.create(5, body);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/5/note-shares', body, {});
			expect(res.ok).toBe(true);
		});
	});

	describe('update()', () => {
		it('PATCHes /war-rooms/:id/note-shares/:shareId', async () => {
			mock('patch').mockResolvedValueOnce({ ok: true, data: share() });
			await WarRoomNoteSharesService.update(5, 7, { scope: 'all', include_future: true });
			expect(ApiService.patch).toHaveBeenCalledWith(
				'/war-rooms/5/note-shares/7',
				{ scope: 'all', include_future: true },
				{}
			);
		});
	});

	describe('remove()', () => {
		it('DELETEs /war-rooms/:id/note-shares/:shareId', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, status: 204, data: null });
			const res = await WarRoomNoteSharesService.remove(5, 7);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/5/note-shares/7', {});
			expect(res.ok).toBe(true);
		});
	});

	describe('resync()', () => {
		it('POSTs an empty body to .../:shareId/resync', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: share() });
			await WarRoomNoteSharesService.resync(5, 7);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/5/note-shares/7/resync', {}, {});
		});
	});

	describe('preview()', () => {
		it('GETs the preview with scope and target', async () => {
			mock('get').mockResolvedValueOnce({
				ok: true,
				data: { notes: [], targets: [], customers: [] }
			});
			await WarRoomNoteSharesService.preview(5, { folder_id: 3, scope: 'all' });
			expect(ApiService.withQuery).toHaveBeenCalledWith('/war-rooms/5/note-shares/preview', {
				folder_id: 3,
				scope: 'all'
			});
			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms/5/note-shares/preview?folder_id=3&scope=all',
				{}
			);
		});

		it('sends case_ids as one comma-separated value', async () => {
			mock('get').mockResolvedValueOnce({
				ok: true,
				data: { notes: [], targets: [], customers: [] }
			});
			await WarRoomNoteSharesService.preview(5, { note_id: 10, scope: 'cases', case_ids: [1, 2] });
			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms/5/note-shares/preview?note_id=10&scope=cases&case_ids=1,2',
				{}
			);
		});

		it('omits an empty case_ids list', async () => {
			mock('get').mockResolvedValueOnce({
				ok: true,
				data: { notes: [], targets: [], customers: [] }
			});
			await WarRoomNoteSharesService.preview(5, { note_id: 10, scope: 'cases', case_ids: [] });
			expect(ApiService.withQuery).toHaveBeenCalledWith('/war-rooms/5/note-shares/preview', {
				note_id: 10,
				scope: 'cases'
			});
		});
	});
});

describe('buildNoteShareIndex()', () => {
	it('returns empty maps for no shares', () => {
		expect(buildNoteShareIndex([])).toEqual({ notes: {}, folders: {} });
	});

	it('keys note shares by note_id and folder shares by folder_id', () => {
		const index = buildNoteShareIndex([
			share({ share_id: 1, note_id: 10 }),
			share({ share_id: 2, note_id: null, folder_id: 3, scope: 'all' })
		]);
		expect(Object.keys(index.notes)).toEqual(['10']);
		expect(Object.keys(index.folders)).toEqual(['3']);
		expect(index.folders[3].all).toBe(true);
		expect(index.notes[10].all).toBe(false);
	});

	it('counts distinct target cases across shares of the same item', () => {
		const index = buildNoteShareIndex([
			share({
				share_id: 1,
				targets: [
					{ case_id: 1, accessible: true, status: 'synced' },
					{ case_id: 2, accessible: true, status: 'synced' }
				]
			}),
			share({
				share_id: 2,
				delivery: 'copy',
				targets: [
					{ case_id: 2, accessible: true, status: 'copied' },
					{ case_id: 3, accessible: false, status: 'copied' }
				]
			})
		]);
		expect(index.notes[10]).toEqual({ shares: 2, cases: 3, all: false, pending: false });
	});

	it('flags pending / error only for live mirrors', () => {
		const pendingMirror = buildNoteShareIndex([
			share({ targets: [{ case_id: 1, accessible: true, status: 'pending' }] })
		]);
		expect(pendingMirror.notes[10].pending).toBe(true);

		const erroredMirror = buildNoteShareIndex([
			share({ targets: [{ case_id: 1, accessible: true, status: 'error' }] })
		]);
		expect(erroredMirror.notes[10].pending).toBe(true);

		const erroredCopy = buildNoteShareIndex([
			share({ delivery: 'copy', targets: [{ case_id: 1, accessible: true, status: 'error' }] })
		]);
		expect(erroredCopy.notes[10].pending).toBe(false);
	});

	it('tolerates a share without targets', () => {
		const index = buildNoteShareIndex([
			share({ targets: undefined as unknown as NoteShare['targets'] })
		]);
		expect(index.notes[10]).toEqual({ shares: 1, cases: 0, all: false, pending: false });
	});

	it('does not mix note and folder ids that collide', () => {
		const index = buildNoteShareIndex([
			share({ share_id: 1, note_id: 4 }),
			share({
				share_id: 2,
				note_id: null,
				folder_id: 4,
				targets: [{ case_id: 9, accessible: true, status: 'synced' }]
			})
		]);
		expect(index.notes[4].cases).toBe(1);
		expect(index.folders[4].cases).toBe(1);
	});
});

describe('noteShareBadgeLabel()', () => {
	it('shows "All" for an all-cases share', () => {
		expect(noteShareBadgeLabel({ shares: 1, cases: 4, all: true, pending: false })).toBe('All');
	});

	it('shows the distinct case count otherwise', () => {
		expect(noteShareBadgeLabel({ shares: 2, cases: 3, all: false, pending: false })).toBe('3');
	});
});

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

import { WarRoomSitRepsService } from '../war-room-sitreps.service';
import { ApiService } from '../api.service';

describe('WarRoomSitRepsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// -----------------------------------------------------------------------
	// list()
	// -----------------------------------------------------------------------

	describe('list()', () => {
		it('calls GET /war-rooms/{warRoomId}/sitreps with options', async () => {
			const mock = { ok: true, status: 200, data: [] };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomSitRepsService.list(10, { skipTokenRefresh: true });

			expect(ApiService.get).toHaveBeenCalledOnce();
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/10/sitreps', {
				skipTokenRefresh: true
			});
			expect(res).toBe(mock);
		});

		it('uses default empty options when none supplied', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: []
			});

			await WarRoomSitRepsService.list(10);

			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/10/sitreps', {});
		});
	});

	// -----------------------------------------------------------------------
	// get()
	// -----------------------------------------------------------------------

	describe('get()', () => {
		it('calls GET /war-rooms/{warRoomId}/sitreps/{sitrepId}', async () => {
			const mock = {
				ok: true,
				status: 200,
				data: {
					sitrep_id: 3,
					war_room_id: 10,
					version: 1,
					title: 'Situation Update',
					authored_by_id: 1,
					authored_at: '2024-01-01T12:00:00Z',
					published: false,
					snapshot_json: null
				}
			};
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomSitRepsService.get(10, 3);

			expect(ApiService.get).toHaveBeenCalledOnce();
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/10/sitreps/3', {});
			expect(res).toBe(mock);
		});

		it('forwards options', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: {}
			});

			await WarRoomSitRepsService.get(10, 3, { skipTokenRefresh: true });

			const [, opts] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// create()
	// -----------------------------------------------------------------------

	describe('create()', () => {
		it('calls POST /war-rooms/{warRoomId}/sitreps with body and options', async () => {
			const body = { title: 'Initial SitRep', body_md: '## Summary\nAll quiet.' };
			const mock = {
				ok: true,
				status: 201,
				data: {
					sitrep_id: 1,
					war_room_id: 10,
					version: 1,
					...body,
					authored_by_id: null,
					authored_at: null,
					published: false,
					snapshot_json: null
				}
			};
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomSitRepsService.create(10, body, { skipTokenRefresh: true });

			expect(ApiService.post).toHaveBeenCalledOnce();
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/10/sitreps', body, {
				skipTokenRefresh: true
			});
			expect(res).toBe(mock);
		});

		it('sends title-only body when body_md is omitted', async () => {
			const body = { title: 'Title only' };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 201,
				data: {}
			});

			await WarRoomSitRepsService.create(10, body);

			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/10/sitreps', body, {});
		});
	});

	// -----------------------------------------------------------------------
	// update()
	// -----------------------------------------------------------------------

	describe('update()', () => {
		it('calls PATCH /war-rooms/{warRoomId}/sitreps/{sitrepId} with body', async () => {
			const body = { title: 'Revised', body_md: '## Update\nCritical.' };
			const mock = { ok: true, status: 200, data: {} };
			(ApiService.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomSitRepsService.update(10, 3, body);

			expect(ApiService.patch).toHaveBeenCalledOnce();
			expect(ApiService.patch).toHaveBeenCalledWith('/war-rooms/10/sitreps/3', body, {});
			expect(res).toBe(mock);
		});

		it('accepts partial body (title only)', async () => {
			(ApiService.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: {}
			});

			await WarRoomSitRepsService.update(10, 3, { title: 'New title' }, { skipTokenRefresh: true });

			expect(ApiService.patch).toHaveBeenCalledWith(
				'/war-rooms/10/sitreps/3',
				{ title: 'New title' },
				{ skipTokenRefresh: true }
			);
		});

		it('accepts partial body (body_md only)', async () => {
			(ApiService.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: {}
			});

			await WarRoomSitRepsService.update(10, 3, { body_md: '# New content' });

			expect(ApiService.patch).toHaveBeenCalledWith(
				'/war-rooms/10/sitreps/3',
				{ body_md: '# New content' },
				{}
			);
		});
	});

	// -----------------------------------------------------------------------
	// publish()
	// -----------------------------------------------------------------------

	describe('publish()', () => {
		it('calls POST /war-rooms/{warRoomId}/sitreps/{sitrepId}/publish with empty body', async () => {
			const mock = { ok: true, status: 200, data: { sitrep_id: 3, published: true } };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomSitRepsService.publish(10, 3);

			expect(ApiService.post).toHaveBeenCalledOnce();
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/10/sitreps/3/publish', {}, {});
			expect(res).toBe(mock);
		});

		it('forwards options', async () => {
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: {}
			});

			await WarRoomSitRepsService.publish(10, 3, { skipTokenRefresh: true });

			const [, , opts] = (ApiService.post as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// remove()
	// -----------------------------------------------------------------------

	describe('remove()', () => {
		it('calls DELETE /war-rooms/{warRoomId}/sitreps/{sitrepId}', async () => {
			const mock = { ok: true, status: 204, data: null };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomSitRepsService.remove(10, 3);

			expect(ApiService.delete).toHaveBeenCalledOnce();
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/10/sitreps/3', {});
			expect(res).toBe(mock);
		});

		it('forwards options', async () => {
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 204,
				data: null
			});

			await WarRoomSitRepsService.remove(10, 3, { skipTokenRefresh: true });

			const [, opts] = (ApiService.delete as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// exportUrl() — pure URL construction, no fetch
	// -----------------------------------------------------------------------

	describe('exportUrl()', () => {
		it('returns correct URL for md format', () => {
			expect(WarRoomSitRepsService.exportUrl(10, 3, 'md')).toBe(
				'/api/v2/war-rooms/10/sitreps/3/export.md'
			);
		});

		it('returns correct URL for html format', () => {
			expect(WarRoomSitRepsService.exportUrl(10, 3, 'html')).toBe(
				'/api/v2/war-rooms/10/sitreps/3/export.html'
			);
		});

		it('returns correct URL for pdf format', () => {
			expect(WarRoomSitRepsService.exportUrl(10, 3, 'pdf')).toBe(
				'/api/v2/war-rooms/10/sitreps/3/export.pdf'
			);
		});

		it('embeds the correct warRoomId and sitrepId', () => {
			const url = WarRoomSitRepsService.exportUrl(99, 42, 'pdf');
			expect(url).toContain('/war-rooms/99/');
			expect(url).toContain('/sitreps/42/');
		});
	});
});

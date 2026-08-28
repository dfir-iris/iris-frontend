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

import { WarRoomsService } from '../war-rooms.service';
import { ApiService } from '../api.service';

const mock = (method: keyof typeof ApiService) =>
	ApiService[method] as unknown as ReturnType<typeof vi.fn>;

describe('WarRoomsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// ---- list() URL building ------------------------------------------------

	describe('list()', () => {
		it('calls /war-rooms with no query string when params is omitted', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			const result = await WarRoomsService.list();
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms', {});
			expect(result).toEqual({ ok: true, data: [] });
		});

		it('calls /war-rooms with no query string when params is empty', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomsService.list({});
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms', {});
		});

		it('appends state= when params.state is provided', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomsService.list({ state: 'active' });
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms?state=active', {});
		});

		it('appends search= when params.search is provided', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomsService.list({ search: 'incident' });
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms?search=incident', {});
		});

		it('appends state= and search= together', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomsService.list({ state: 'open', search: 'breach' });
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms?state=open&search=breach', {});
		});

		it('omits archived param when archived is "live"', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomsService.list({ archived: 'live' });
			// 'live' is the default — no query param should be added
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms', {});
		});

		it('appends archived=true when archived is "archived"', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomsService.list({ archived: 'archived' });
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms?archived=true', {});
		});

		it('appends archived=any when archived is "any"', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomsService.list({ archived: 'any' });
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms?archived=any', {});
		});

		it('combines state, search and archived=archived', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomsService.list({ state: 'closed', search: 'old', archived: 'archived' });
			expect(ApiService.get).toHaveBeenCalledWith(
				'/war-rooms?state=closed&search=old&archived=true',
				{}
			);
		});

		it('forwards ApiOptions to ApiService.get', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			const opts = { signal: new AbortController().signal };
			await WarRoomsService.list({}, opts);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms', opts);
		});
	});

	// ---- create() ----------------------------------------------------------

	describe('create()', () => {
		it('POSTs to /war-rooms with the supplied body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { war_room_id: 1 } });
			const body = { name: 'Alpha Room', state: 'open' as const };
			const result = await WarRoomsService.create(body);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms', body, {});
			expect(result).toEqual({ ok: true, data: { war_room_id: 1 } });
		});
	});

	// ---- get() -------------------------------------------------------------

	describe('get()', () => {
		it('GETs /war-rooms/:id', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: { war_room_id: 7 } });
			const result = await WarRoomsService.get(7);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7', {});
			expect(result).toEqual({ ok: true, data: { war_room_id: 7 } });
		});
	});

	// ---- update() uses PATCH -----------------------------------------------

	describe('update()', () => {
		it('PATCHes /war-rooms/:id with the supplied body', async () => {
			mock('patch').mockResolvedValueOnce({ ok: true, data: { war_room_id: 3 } });
			const body = { name: 'Renamed', state: 'standby' as const };
			const result = await WarRoomsService.update(3, body);
			expect(ApiService.patch).toHaveBeenCalledWith('/war-rooms/3', body, {});
			expect(result).toEqual({ ok: true, data: { war_room_id: 3 } });
		});

		it('does NOT call ApiService.put', async () => {
			mock('patch').mockResolvedValueOnce({ ok: true, data: {} });
			await WarRoomsService.update(3, { name: 'X' });
			expect(ApiService.put).not.toHaveBeenCalled();
		});
	});

	// ---- remove() ----------------------------------------------------------

	describe('remove()', () => {
		it('DELETEs /war-rooms/:id', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, data: null });
			const result = await WarRoomsService.remove(5);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/5', {});
			expect(result).toEqual({ ok: true, data: null });
		});
	});

	// ---- archive / unarchive -----------------------------------------------

	describe('archive()', () => {
		it('POSTs to /war-rooms/:id/archive with an empty body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { war_room_id: 2 } });
			await WarRoomsService.archive(2);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/2/archive', {}, {});
		});
	});

	describe('unarchive()', () => {
		it('DELETEs /war-rooms/:id/archive', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, data: { war_room_id: 2 } });
			await WarRoomsService.unarchive(2);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/2/archive', {});
		});
	});

	// ---- Members -----------------------------------------------------------

	describe('listMembers()', () => {
		it('GETs /war-rooms/:id/members', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomsService.listMembers(10);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/10/members', {});
		});
	});

	describe('addMember()', () => {
		it('POSTs to /war-rooms/:id/members with the supplied body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { user_id: 99 } });
			const body = { user_id: 99, role: 'responder' as const };
			await WarRoomsService.addMember(10, body);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/10/members', body, {});
		});
	});

	describe('removeMember()', () => {
		it('DELETEs /war-rooms/:id/members/:userId', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, data: null });
			await WarRoomsService.removeMember(10, 99);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/10/members/99', {});
		});
	});

	// ---- People ------------------------------------------------------------

	describe('listPeople()', () => {
		it('GETs /war-rooms/:id/people', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomsService.listPeople(10);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/10/people', {});
		});
	});

	// ---- Cases -------------------------------------------------------------

	describe('listCases()', () => {
		it('GETs /war-rooms/:id/cases', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			await WarRoomsService.listCases(10);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/10/cases', {});
		});
	});

	describe('attachCase()', () => {
		it('POSTs to /war-rooms/:id/cases with the supplied body', async () => {
			mock('post').mockResolvedValueOnce({ ok: true, data: { case_id: 42 } });
			const body = { case_id: 42, note: 'linked' };
			await WarRoomsService.attachCase(10, body);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/10/cases', body, {});
		});
	});

	describe('detachCase()', () => {
		it('DELETEs /war-rooms/:id/cases/:caseId', async () => {
			mock('delete').mockResolvedValueOnce({ ok: true, data: null });
			await WarRoomsService.detachCase(10, 42);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/10/cases/42', {});
		});
	});

	// ---- Reverse lookup ----------------------------------------------------

	describe('forCase()', () => {
		it('GETs /cases/:caseId/war-rooms', async () => {
			mock('get').mockResolvedValueOnce({ ok: true, data: [] });
			const result = await WarRoomsService.forCase(42);
			expect(ApiService.get).toHaveBeenCalledWith('/cases/42/war-rooms', {});
			expect(result).toEqual({ ok: true, data: [] });
		});
	});
});

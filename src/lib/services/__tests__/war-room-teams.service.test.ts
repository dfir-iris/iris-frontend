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

import { WarRoomTeamsService } from '../war-room-teams.service';
import { ApiService } from '../api.service';

describe('WarRoomTeamsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	// -----------------------------------------------------------------------
	// list()
	// -----------------------------------------------------------------------

	describe('list()', () => {
		it('calls GET /war-rooms/{warRoomId}/teams', async () => {
			const mock = { ok: true, status: 200, data: [] };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTeamsService.list(7);

			expect(ApiService.get).toHaveBeenCalledOnce();
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/teams', {});
			expect(res).toBe(mock);
		});

		it('forwards options', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: [] });

			await WarRoomTeamsService.list(7, { skipTokenRefresh: true });

			const [, opts] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// get()
	// -----------------------------------------------------------------------

	describe('get()', () => {
		it('calls GET /war-rooms/{warRoomId}/teams/{teamId}', async () => {
			const mock = {
				ok: true,
				status: 200,
				data: {
					team_id: 2,
					war_room_id: 7,
					name: 'Responders',
					description: null,
					color: '#ff0000',
					created_at: null,
					created_by_id: null,
					member_ids: [1, 2, 3]
				}
			};
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTeamsService.get(7, 2);

			expect(ApiService.get).toHaveBeenCalledOnce();
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/teams/2', {});
			expect(res).toBe(mock);
		});

		it('forwards options', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: {} });

			await WarRoomTeamsService.get(7, 2, { skipTokenRefresh: true });

			const [, opts] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// create()
	// -----------------------------------------------------------------------

	describe('create()', () => {
		it('calls POST /war-rooms/{warRoomId}/teams with full body', async () => {
			const body = { name: 'Blue Team', description: 'Defenders', color: '#0000ff' };
			const mock = { ok: true, status: 201, data: { team_id: 1, war_room_id: 7, ...body, created_at: null, created_by_id: null, member_ids: null } };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTeamsService.create(7, body);

			expect(ApiService.post).toHaveBeenCalledOnce();
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/teams', body, {});
			expect(res).toBe(mock);
		});

		it('sends name-only body when optional fields are omitted', async () => {
			const body = { name: 'Minimal' };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 201, data: {} });

			await WarRoomTeamsService.create(7, body);

			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/7/teams', body, {});
		});

		it('forwards options', async () => {
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 201, data: {} });

			await WarRoomTeamsService.create(7, { name: 'T' }, { skipTokenRefresh: true });

			const [, , opts] = (ApiService.post as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// update()
	// -----------------------------------------------------------------------

	describe('update()', () => {
		it('calls PATCH /war-rooms/{warRoomId}/teams/{teamId} with body', async () => {
			const body = { name: 'Renamed', color: '#00ff00' };
			const mock = { ok: true, status: 200, data: {} };
			(ApiService.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTeamsService.update(7, 2, body);

			expect(ApiService.patch).toHaveBeenCalledOnce();
			expect(ApiService.patch).toHaveBeenCalledWith('/war-rooms/7/teams/2', body, {});
			expect(res).toBe(mock);
		});

		it('accepts partial update (name only)', async () => {
			(ApiService.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: {} });

			await WarRoomTeamsService.update(7, 2, { name: 'New name' }, { skipTokenRefresh: true });

			expect(ApiService.patch).toHaveBeenCalledWith(
				'/war-rooms/7/teams/2',
				{ name: 'New name' },
				{ skipTokenRefresh: true }
			);
		});

		it('accepts null description to clear the field', async () => {
			(ApiService.patch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: {} });

			await WarRoomTeamsService.update(7, 2, { description: null });

			const [, body] = (ApiService.patch as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(body).toEqual({ description: null });
		});
	});

	// -----------------------------------------------------------------------
	// remove()
	// -----------------------------------------------------------------------

	describe('remove()', () => {
		it('calls DELETE /war-rooms/{warRoomId}/teams/{teamId}', async () => {
			const mock = { ok: true, status: 204, data: null };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTeamsService.remove(7, 2);

			expect(ApiService.delete).toHaveBeenCalledOnce();
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/7/teams/2', {});
			expect(res).toBe(mock);
		});

		it('forwards options', async () => {
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204, data: null });

			await WarRoomTeamsService.remove(7, 2, { skipTokenRefresh: true });

			const [, opts] = (ApiService.delete as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// listMembers()
	// -----------------------------------------------------------------------

	describe('listMembers()', () => {
		it('calls GET /war-rooms/{warRoomId}/teams/{teamId}/members', async () => {
			const mock = {
				ok: true,
				status: 200,
				data: [
					{ team_id: 2, user_id: 5, added_at: null, added_by_id: null }
				]
			};
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTeamsService.listMembers(7, 2);

			expect(ApiService.get).toHaveBeenCalledOnce();
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/7/teams/2/members', {});
			expect(res).toBe(mock);
		});

		it('forwards options', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: [] });

			await WarRoomTeamsService.listMembers(7, 2, { skipTokenRefresh: true });

			const [, opts] = (ApiService.get as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// addMember()
	// -----------------------------------------------------------------------

	describe('addMember()', () => {
		it('calls POST /war-rooms/{warRoomId}/teams/{teamId}/members with user_id', async () => {
			const mock = {
				ok: true,
				status: 201,
				data: { team_id: 2, user_id: 5, added_at: null, added_by_id: null }
			};
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTeamsService.addMember(7, 2, 5);

			expect(ApiService.post).toHaveBeenCalledOnce();
			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/7/teams/2/members',
				{ user_id: 5 },
				{}
			);
			expect(res).toBe(mock);
		});

		it('includes auto_added_room_member flag in response when present', async () => {
			const mock = {
				ok: true,
				status: 201,
				data: {
					team_id: 2,
					user_id: 9,
					added_at: null,
					added_by_id: null,
					auto_added_room_member: true
				}
			};
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTeamsService.addMember(7, 2, 9);

			expect(res.data).toMatchObject({ auto_added_room_member: true });
		});

		it('forwards options', async () => {
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 201, data: {} });

			await WarRoomTeamsService.addMember(7, 2, 5, { skipTokenRefresh: true });

			const [, , opts] = (ApiService.post as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});

	// -----------------------------------------------------------------------
	// removeMember()
	// -----------------------------------------------------------------------

	describe('removeMember()', () => {
		it('calls DELETE /war-rooms/{warRoomId}/teams/{teamId}/members/{userId}', async () => {
			const mock = { ok: true, status: 204, data: null };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mock);

			const res = await WarRoomTeamsService.removeMember(7, 2, 5);

			expect(ApiService.delete).toHaveBeenCalledOnce();
			expect(ApiService.delete).toHaveBeenCalledWith(
				'/war-rooms/7/teams/2/members/5',
				{}
			);
			expect(res).toBe(mock);
		});

		it('embeds correct user ID in path', async () => {
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204, data: null });

			await WarRoomTeamsService.removeMember(7, 2, 99);

			const [url] = (ApiService.delete as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(url).toBe('/war-rooms/7/teams/2/members/99');
		});

		it('forwards options', async () => {
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 204, data: null });

			await WarRoomTeamsService.removeMember(7, 2, 5, { skipTokenRefresh: true });

			const [, opts] = (ApiService.delete as ReturnType<typeof vi.fn>).mock.calls[0];
			expect(opts).toEqual({ skipTokenRefresh: true });
		});
	});
});

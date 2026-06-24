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

import { GroupsService } from '../groups.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type {
	Group,
	CreateGroupBody,
	UpdateGroupBody,
	UpdateGroupMembersBody
} from '../groups.service';

describe('GroupsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() hits the v2 paginated groups endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: [
				{
					group_auto_follow: false,
					group_auto_follow_access_level: 0,
					group_description: 'Admins',
					group_id: 1,
					group_members: [
						{ id: 1, name: 'John Doe', user: 'jdoe' },
						{ id: 2, name: 'Alice Smith', user: 'asmith' }
					],
					group_name: 'Administrators',
					group_permissions: 7,
					group_permissions_list: [
						{ name: 'perm_a', value: 1 },
						{ name: 'perm_b', value: 2 }
					],
					group_uuid: 'group-uuid-1',
					registry: null
				}
			] satisfies Group[]
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await GroupsService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		// per_page=200 is large enough to cover any realistic group
		// count in a single request — production code reads
		// `res.data.data` (the paginated envelope's array) the same
		// way the legacy `{status, data: T[]}` envelope was unwrapped.
		expect(ApiService.get).toHaveBeenCalledWith('/manage/groups?per_page=200', options);
		expect(res).toBe(mockResponse);
	});

	it('create() POSTs to the v2 collection', async () => {
		const body: CreateGroupBody = {
			group_name: 'New Group',
			group_description: 'New group description',
			group_permissions: 3
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 201,
			data: {
				group_auto_follow: false,
				group_auto_follow_access_level: 0,
				group_description: 'New group description',
				group_id: 101,
				group_members: [],
				group_name: 'New Group',
				group_permissions: 3,
				group_permissions_list: [{ name: 'perm_a', value: 1 }],
				group_uuid: 'group-uuid-101',
				registry: null
			} satisfies Group
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await GroupsService.create(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/groups', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() PUTs to the v2 by-id endpoint', async () => {
		const body: UpdateGroupBody = {
			group_description: 'Updated description'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				group_auto_follow: true,
				group_auto_follow_access_level: 1,
				group_description: 'Updated description',
				group_id: 7,
				group_members: [{ id: 1, name: 'John Doe', user: 'jdoe' }],
				group_name: 'Ops',
				group_permissions: 5,
				group_permissions_list: [{ name: 'perm_x', value: 4 }],
				group_uuid: 'group-uuid-7',
				registry: null
			} satisfies Group
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await GroupsService.update(7, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/manage/groups/7', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() DELETEs the v2 by-id endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await GroupsService.remove(7, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/manage/groups/7', options);
		expect(res).toBe(mockResponse);
	});

	it('updateMembers() PUTs to the v2 members sub-resource', async () => {
		const body: UpdateGroupMembersBody = {
			group_members: [1, 2, 3]
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: null
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await GroupsService.updateMembers(7, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		// Backend accepts either `members` (v2) or `group_members`
		// (legacy alias) — we keep sending the legacy key for
		// back-compat with any caller still on the old payload shape.
		expect(ApiService.put).toHaveBeenCalledWith('/manage/groups/7/members', body, options);
		expect(res).toBe(mockResponse);
	});

	it('removeMember() DELETEs the v2 members/{userId} sub-resource', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await GroupsService.removeMember(7, 123, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/manage/groups/7/members/123', options);
		expect(res).toBe(mockResponse);
	});
});

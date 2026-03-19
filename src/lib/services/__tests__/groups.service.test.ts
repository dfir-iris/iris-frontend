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

	it('list() should call ApiService.get with /manage/groups/list + options', async () => {
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
		expect(ApiService.get).toHaveBeenCalledWith('/manage/groups/list', options);
		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /manage/groups/add, body, options', async () => {
		const body: CreateGroupBody = {
			group_name: 'New Group',
			group_description: 'New group description',
			group_permissions: 3
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
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
		expect(ApiService.post).toHaveBeenCalledWith('/manage/groups/add', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.post with /manage/groups/update/{id}, body, options', async () => {
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

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await GroupsService.update(7, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/groups/update/7', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() should call ApiService.post with /manage/groups/delete/{id}, empty body, options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await GroupsService.remove(7, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/groups/delete/7', {}, options);
		expect(res).toBe(mockResponse);
	});

	it('updateMembers() should call ApiService.post with /manage/groups/{id}/members/update, body, options', async () => {
		const body: UpdateGroupMembersBody = {
			group_members: [1, 2, 3]
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await GroupsService.updateMembers(7, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/groups/7/members/update', body, options);
		expect(res).toBe(mockResponse);
	});

	it('removeMember() should call ApiService.post with /manage/groups/{id}/members/delete/{userId}, empty body, options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await GroupsService.removeMember(7, 123, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/groups/7/members/delete/123',
			{},
			options
		);
		expect(res).toBe(mockResponse);
	});
});

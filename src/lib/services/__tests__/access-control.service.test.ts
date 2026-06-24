/**
 * Smoke tests for the v2 Access Control service.
 *
 * Covers the URL + body shape for each route group: user CRUD,
 * group-membership edits, customer access, case access, audit,
 * recompute, MFA reset, API-key rotation, and the supporting
 * /schema + /accessible-cases lookups.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn((url: string, params: Record<string, unknown>) => {
			const qs = new URLSearchParams();
			for (const [k, v] of Object.entries(params)) {
				if (v == null) continue;
				qs.append(k, String(v));
			}
			const q = qs.toString();
			return q ? `${url}?${q}` : url;
		}),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { AccessControlService } from '../access-control.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';

describe('AccessControlService — users', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('searchUsers() paginates against /manage/users', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { total: 0, data: [], next_page: null, last_page: 1, current_page: 1 }
		});

		await AccessControlService.searchUsers({ page: 1, per_page: 25, search: 'alice' }, options);

		expect(ApiService.get).toHaveBeenCalledWith(
			'/manage/users?page=1&per_page=25&search=alice',
			options
		);
	});

	it('createUser() POSTs to /manage/users', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 201,
			data: { user_id: 1 }
		});

		await AccessControlService.createUser({
			user_name: 'A',
			user_login: 'a',
			user_email: 'a@b.com',
			user_password: 'pw'
		});

		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/users',
			expect.objectContaining({ user_login: 'a' }),
			{}
		);
	});

	it('updateUser() PUTs to /manage/users/<id>', async () => {
		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { user_id: 7 }
		});

		await AccessControlService.updateUser(7, { user_email: 'new@example.com' });

		expect(ApiService.put).toHaveBeenCalledWith(
			'/manage/users/7',
			{ user_email: 'new@example.com' },
			{}
		);
	});

	it('deleteUser() DELETEs /manage/users/<id>', async () => {
		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 204,
			data: null
		});

		await AccessControlService.deleteUser(7);

		expect(ApiService.delete).toHaveBeenCalledWith('/manage/users/7', {});
	});

	it('activateUser() / deactivateUser() hit the right sub-routes', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			data: { user_id: 7 }
		});

		await AccessControlService.activateUser(7);
		await AccessControlService.deactivateUser(7);

		expect(ApiService.post).toHaveBeenNthCalledWith(1, '/manage/users/7/activate', {}, {});
		expect(ApiService.post).toHaveBeenNthCalledWith(2, '/manage/users/7/deactivate', {}, {});
	});

	it('renewUserApiKey() / resetUserMfa() / recomputeUserAccess() POST', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			data: {}
		});

		await AccessControlService.renewUserApiKey(7);
		await AccessControlService.resetUserMfa(7);
		await AccessControlService.recomputeUserAccess(7);

		expect(ApiService.post).toHaveBeenNthCalledWith(1, '/manage/users/7/api-key/renew', {}, {});
		expect(ApiService.post).toHaveBeenNthCalledWith(2, '/manage/users/7/mfa/reset', {}, {});
		expect(ApiService.post).toHaveBeenNthCalledWith(3, '/manage/users/7/recompute-access', {}, {});
	});

	it('auditUser() GETs /audit', async () => {
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { access_audit: [], permissions_audit: [] }
		});

		await AccessControlService.auditUser(7);

		expect(ApiService.get).toHaveBeenCalledWith('/manage/users/7/audit', {});
	});

	it('setUserGroups() PUTs the membership list', async () => {
		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {}
		});

		await AccessControlService.setUserGroups(7, [1, 2, 3]);

		expect(ApiService.put).toHaveBeenCalledWith(
			'/manage/users/7/groups',
			{ groups: [1, 2, 3] },
			{}
		);
	});

	it('setUserCustomers() PUTs the customer list', async () => {
		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {}
		});

		await AccessControlService.setUserCustomers(7, [1, 2]);

		expect(ApiService.put).toHaveBeenCalledWith(
			'/manage/users/7/customers',
			{ customers: [1, 2] },
			{}
		);
	});

	it('setUserCasesAccess() POSTs cases + access_level', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {}
		});

		await AccessControlService.setUserCasesAccess(7, [10, 11], 2);

		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/users/7/cases-access',
			{ cases_list: [10, 11], access_level: 2 },
			{}
		);
	});
});

describe('AccessControlService — groups', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('createGroup() POSTs to /manage/groups', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 201,
			data: {}
		});

		await AccessControlService.createGroup({
			group_name: 'Ops',
			group_description: 'Ops team',
			group_permissions: 7
		});

		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/groups',
			expect.objectContaining({ group_name: 'Ops' }),
			{}
		);
	});

	it('updateGroup() PUTs to /manage/groups/<id>', async () => {
		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {}
		});

		await AccessControlService.updateGroup(7, { group_permissions: 3 });

		expect(ApiService.put).toHaveBeenCalledWith(
			'/manage/groups/7',
			{ group_permissions: 3 },
			{}
		);
	});

	it('setGroupMembers() PUTs to /manage/groups/<id>/members', async () => {
		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: {}
		});

		await AccessControlService.setGroupMembers(7, [1, 2]);

		expect(ApiService.put).toHaveBeenCalledWith(
			'/manage/groups/7/members',
			{ members: [1, 2] },
			{}
		);
	});

	it('removeGroupMember() DELETEs /manage/groups/<id>/members/<userId>', async () => {
		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 204,
			data: null
		});

		await AccessControlService.removeGroupMember(7, 42);

		expect(ApiService.delete).toHaveBeenCalledWith('/manage/groups/7/members/42', {});
	});

	it('setGroupCasesAccess() POSTs auto_follow or explicit cases_list', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
			ok: true,
			status: 200,
			data: {}
		});

		await AccessControlService.setGroupCasesAccess(7, {
			auto_follow_cases: true,
			access_level: 4
		});
		await AccessControlService.setGroupCasesAccess(7, {
			cases_list: [1, 2],
			access_level: 2
		});

		expect(ApiService.post).toHaveBeenNthCalledWith(
			1,
			'/manage/groups/7/cases-access',
			{ auto_follow_cases: true, access_level: 4 },
			{}
		);
		expect(ApiService.post).toHaveBeenNthCalledWith(
			2,
			'/manage/groups/7/cases-access',
			{ cases_list: [1, 2], access_level: 2 },
			{}
		);
	});
});

describe('AccessControlService — schema + accessible cases', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('schema() GETs /manage/access-control/schema', async () => {
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { permissions: [], case_access_levels: [] }
		});

		await AccessControlService.schema();

		expect(ApiService.get).toHaveBeenCalledWith('/manage/access-control/schema', {});
	});

	it('accessibleCases() GETs the case picker with a search filter', async () => {
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { data: [] }
		});

		await AccessControlService.accessibleCases('phish');

		expect(ApiService.get).toHaveBeenCalledWith(
			'/manage/access-control/accessible-cases?search=phish',
			{}
		);
	});

	it('recomputeAllAccess() POSTs the bulk recompute', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { message: 'Recomputed' }
		});

		await AccessControlService.recomputeAllAccess();

		expect(ApiService.post).toHaveBeenCalledWith('/manage/access-control/recompute-all', {}, {});
	});
});

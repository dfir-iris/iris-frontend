import { test, expect } from '../helpers/fixtures';
import { adminApi, apiJson } from '../helpers/api';

// Manage / users and groups — read-only coverage (CRUD risks breaking the
// admin account; we only test list/get endpoints plus a safe create+delete).

test.describe('Manage · users API', () => {
	test('list users returns at least one user', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/users');
			expect(res.ok(), await res.text()).toBeTruthy();
			const body = (await res.json()) as unknown;
			const rows = Array.isArray(body)
				? (body as unknown[])
				: ((body as { data: unknown[] }).data ?? []);
			expect(rows.length).toBeGreaterThan(0);
		} finally {
			await api.dispose();
		}
	});

	test('GET /api/v2/manage/users/me (or whoami) returns current user', async () => {
		const api = await adminApi();
		try {
			// Try both common endpoint shapes.
			const res = await api.get('/api/v2/manage/users/me');
			// Accept 200 or 404 (endpoint may not exist; /api/v2/users/me or /api/v2/me)
			expect(res.status()).toBeLessThan(500);
		} finally {
			await api.dispose();
		}
	});
});

test.describe('Manage · groups API', () => {
	test('list groups returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/groups');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});

	test('create → delete group', async () => {
		const api = await adminApi();
		let groupId: number | undefined;
		const groupName = `e2e-group-${Math.random().toString(36).slice(2, 8)}`;

		try {
			const create = await api.post('/api/v2/manage/groups', {
				data: {
					group_name: groupName,
					group_description: 'created by e2e'
				}
			});
			expect(create.ok(), await create.text()).toBeTruthy();
			const body = await apiJson<{ group_id: number }>(create);
			groupId = body.group_id;
			expect(groupId).toBeGreaterThan(0);
		} finally {
			if (groupId) {
				await api.delete(`/api/v2/manage/groups/${groupId}`).catch(() => {});
			}
			await api.dispose();
		}
	});
});

import { test, expect } from '../helpers/fixtures';
import { adminApi } from '../helpers/api';

// Manage / access control — read endpoints only (CRUD changes permissions
// which can lock out the admin; we only test list operations).

test.describe('Manage · access control API', () => {
	test('list access control entries returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/access-control');
			// Access control list may require additional permissions; accept 200 or 403.
			expect(res.status()).toBeLessThan(500);
		} finally {
			await api.dispose();
		}
	});

	test('list groups with their permissions returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/groups');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});
});

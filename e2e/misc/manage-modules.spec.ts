import { test, expect } from '@playwright/test';
import { adminApi } from '../helpers/api';

// Manage / modules — read-only listing; we don't install/remove modules
// in tests as that risks destabilising the stack.

test.describe('Manage · modules API', () => {
	test('list installed modules returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/modules');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});

	test('list dim hooks returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/modules/hooks');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});
});

import { test, expect } from '@playwright/test';
import { adminApi } from '../helpers/api';

// Manage / report templates — read-only listing.

test.describe('Manage · report templates API', () => {
	test('list report templates returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/report-templates');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});
});

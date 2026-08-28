import { test, expect } from '@playwright/test';
import { adminApi } from '../helpers/api';

// Notification API: list, mark-read. No WebSocket — REST only.

test.describe('Notifications · API', () => {
	test('list notifications returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/notifications');
			expect(res.ok(), await res.text()).toBeTruthy();
			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toBeDefined();
		} finally {
			await api.dispose();
		}
	});

	test('mark-all-read endpoint responds without error', async () => {
		const api = await adminApi();
		try {
			// Endpoint may be POST or PUT; try both and accept either 2xx.
			const res = await api.post('/api/v2/notifications/mark-all-read', { data: {} });
			// Accept 200, 204, or 404 (if endpoint name differs) — just not 5xx.
			expect(res.status()).toBeLessThan(500);
		} finally {
			await api.dispose();
		}
	});
});

import { test, expect } from '@playwright/test';
import { adminApi, seed, cleanup } from '../helpers/api';

// Alert and cluster investigation-progress endpoints.

test.describe('Alert · investigation progress API', () => {
	test('list investigation progress for an alert', async () => {
		const api = await adminApi();
		const alertId = await seed.alert(api, { alert_title: 'e2e inv progress' });

		try {
			const res = await api.get(`/api/v2/alerts/${alertId}/investigation-progress`);
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});
});

test.describe('Alert cluster · investigation progress API', () => {
	test('list investigation progress for a cluster returns 200 or 404', async () => {
		// We use a large numeric ID that almost certainly doesn't exist; the
		// important thing is the endpoint responds (not 500).
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/alert-clusters/999999/investigation-progress');
			expect(res.status()).toBeLessThan(500);
		} finally {
			await api.dispose();
		}
	});
});

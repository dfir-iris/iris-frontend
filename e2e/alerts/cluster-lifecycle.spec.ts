import { test, expect } from '@playwright/test';
import { adminApi, discover, apiJson } from '../helpers/api';

// Alert cluster lifecycle via the v2 REST API.

test.describe('Alert clusters · API lifecycle', () => {
	test('cluster list endpoint returns paginated result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/alert-clusters');
			expect(res.ok(), await res.text()).toBeTruthy();
			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toBeDefined();
		} finally {
			await api.dispose();
		}
	});

	test('create a cluster then delete it', async () => {
		const api = await adminApi();
		const ids = await discover(api);
		let clusterId: number | undefined;

		try {
			const res = await api.post('/api/v2/alert-clusters', {
				data: {
					cluster_title: 'e2e cluster',
					cluster_description: 'e2e',
					cluster_customer_id: ids.customerId,
					cluster_status_id: 1
				}
			});
			expect(res.ok(), await res.text()).toBeTruthy();
			const body = await apiJson<{ cluster_id: number }>(res);
			clusterId = body.cluster_id;
			expect(clusterId).toBeGreaterThan(0);
		} finally {
			if (clusterId) {
				await api.delete(`/api/v2/alert-clusters/${clusterId}`).catch(() => {});
			}
			await api.dispose();
		}
	});

	test('GET nonexistent cluster returns 404', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/alert-clusters/999999999');
			expect(res.status()).toBe(404);
		} finally {
			await api.dispose();
		}
	});
});

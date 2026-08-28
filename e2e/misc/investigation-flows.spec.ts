import { test, expect } from '@playwright/test';
import { adminApi, apiJson } from '../helpers/api';

// Investigation flows CRUD — API-level.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('Investigation flows · API', () => {
	test('list flows returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/investigation-flows');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});

	test('create → get → delete flow', async () => {
		const api = await adminApi();
		let flowId: number | undefined;

		try {
			const create = await api.post('/api/v2/investigation-flows', {
				data: {
					flow_name: rand('flow'),
					flow_description: 'e2e test flow',
					flow_target: 'alert',
					flow_is_active: true,
					flow_conditions: {
						logic: 'and',
						conditions: [{ field: 'alert_title', operator: 'eq', value: 'e2e' }]
					},
					flow_actions: []
				}
			});
			expect(create.ok(), await create.text()).toBeTruthy();
			const body = await apiJson<{ flow_id: number }>(create);
			flowId = body.flow_id;
			expect(flowId).toBeGreaterThan(0);

			const get = await api.get(`/api/v2/investigation-flows/${flowId}`);
			expect(get.ok()).toBeTruthy();
		} finally {
			if (flowId) {
				await api.delete(`/api/v2/investigation-flows/${flowId}`).catch(() => {});
			}
			await api.dispose();
		}
	});

	test('GET nonexistent flow returns 404', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/investigation-flows/999999999');
			expect(res.status()).toBe(404);
		} finally {
			await api.dispose();
		}
	});
});

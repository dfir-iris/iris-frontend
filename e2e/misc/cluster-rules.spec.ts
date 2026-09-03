import { test, expect } from '../helpers/fixtures';
import { adminApi, apiJson } from '../helpers/api';

// Cluster rules CRUD — API-level.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('Cluster rules · API', () => {
	test('list cluster rules returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/cluster-rules');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});

	test('create → get → delete cluster rule', async () => {
		const api = await adminApi();
		let ruleId: number | undefined;

		try {
			const create = await api.post('/api/v2/cluster-rules', {
				data: {
					rule_name: rand('rule'),
					rule_description: 'e2e cluster rule',
					rule_is_active: true,
					rule_action_type: 'create_cluster',
					rule_conditions: {
						logic: 'and',
						conditions: [{ field: 'alert_title', operator: 'eq', value: 'e2e' }]
					}
				}
			});
			expect(create.ok(), await create.text()).toBeTruthy();
			const body = await apiJson<{ rule_id: number }>(create);
			ruleId = body.rule_id;
			expect(ruleId).toBeGreaterThan(0);

			const get = await api.get(`/api/v2/cluster-rules/${ruleId}`);
			expect(get.ok()).toBeTruthy();
		} finally {
			if (ruleId) {
				await api.delete(`/api/v2/cluster-rules/${ruleId}`).catch(() => {});
			}
			await api.dispose();
		}
	});

	test('GET nonexistent cluster rule returns 404', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/cluster-rules/999999999');
			expect(res.status()).toBe(404);
		} finally {
			await api.dispose();
		}
	});
});

import { test, expect } from '../helpers/fixtures';
import { adminApi, apiJson } from '../helpers/api';

// Alert filter presets CRUD — API-level.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('Alert filters (presets) · API', () => {
	test('list alert filter presets returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/alerts/filters');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});

	test('create → get → delete alert filter preset', async () => {
		const api = await adminApi();
		let filterId: number | undefined;

		try {
			const create = await api.post('/api/v2/alerts/filters', {
				data: {
					filter_name: rand('filter'),
					filter_data: {},
					filter_is_private: false,
					filter_type: 'alerts'
				}
			});
			expect(create.ok(), await create.text()).toBeTruthy();
			const body = await apiJson<{ filter_id: number }>(create);
			filterId = body.filter_id;
			expect(filterId).toBeGreaterThan(0);

			const get = await api.get(`/api/v2/alerts/filters/${filterId}`);
			expect(get.ok()).toBeTruthy();
		} finally {
			if (filterId) {
				await api.delete(`/api/v2/alerts/filters/${filterId}`).catch(() => {});
			}
			await api.dispose();
		}
	});
});

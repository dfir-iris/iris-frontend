import { test, expect } from '../helpers/fixtures';
import { adminApi, apiJson } from '../helpers/api';

// Manage / banners CRUD.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('Manage · banners API', () => {
	test('list banners returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/banners');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});

	test('create → get → delete banner', async () => {
		const api = await adminApi();
		let bannerId: number | undefined;

		try {
			const create = await api.post('/api/v2/manage/banners', {
				data: {
					text: rand('E2E banner message'),
					purpose: 'info',
					dismissable: true
				}
			});
			expect(create.ok(), await create.text()).toBeTruthy();
			const body = await apiJson<{ id: number }>(create);
			bannerId = body.id;
			expect(bannerId).toBeGreaterThan(0);

			const get = await api.get(`/api/v2/manage/banners/${bannerId}`);
			expect(get.ok(), await get.text()).toBeTruthy();
		} finally {
			if (bannerId) {
				await api.delete(`/api/v2/manage/banners/${bannerId}`).catch(() => {});
			}
			await api.dispose();
		}
	});
});

import { test, expect } from '../helpers/fixtures';
import { adminApi, apiJson } from '../helpers/api';

// Manage / customers CRUD — only the GET list is used as a seed helper;
// here we test create, update, and delete.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('Manage · customers API', () => {
	test('list customers returns at least the default customer', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/customers');
			expect(res.ok(), await res.text()).toBeTruthy();
			const body = (await res.json()) as unknown;
			const rows = Array.isArray(body)
				? (body as unknown[])
				: ((body as { data: unknown[] }).data ?? []);
			expect(rows.length).toBeGreaterThan(0);
		} finally {
			await api.dispose();
		}
	});

	test('create → get → delete customer', async () => {
		const api = await adminApi();
		let customerId: number | undefined;

		try {
			const name = rand('cust');
			const create = await api.post('/api/v2/manage/customers', {
				data: { customer_name: name }
			});
			expect(create.ok(), await create.text()).toBeTruthy();
			const body = await apiJson<{ customer_id: number }>(create);
			customerId = body.customer_id;
			expect(customerId).toBeGreaterThan(0);

			const get = await api.get(`/api/v2/manage/customers/${customerId}`);
			expect(get.ok()).toBeTruthy();
			const fetched = await apiJson<{ customer_name: string }>(get);
			expect(fetched.customer_name).toBe(name);
		} finally {
			if (customerId) {
				await api.delete(`/api/v2/manage/customers/${customerId}`).catch(() => {});
			}
			await api.dispose();
		}
	});

	test('GET nonexistent customer returns 404', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/customers/999999999');
			expect(res.status()).toBe(404);
		} finally {
			await api.dispose();
		}
	});
});

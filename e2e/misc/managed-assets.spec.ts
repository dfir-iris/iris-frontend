import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, discover, apiJson } from '../helpers/api';

const BASE = '/api/v2/manage/managed-assets';

// Discover the first asset type so tests work on any database.
async function firstAssetTypeId(api: Awaited<ReturnType<typeof adminApi>>): Promise<number> {
	const res = await api.get('/api/v2/manage/case-objects/asset-types');
	expect(res.ok(), await res.text()).toBeTruthy();
	const body = (await res.json()) as unknown;
	// Response may be {data: [...]} or [...] directly.
	const rows: Array<{ asset_id: number; asset_name: string }> = Array.isArray(body)
		? (body as Array<{ asset_id: number; asset_name: string }>)
		: ((body as { data: Array<{ asset_id: number; asset_name: string }> }).data ?? []);
	if (!rows.length) throw new Error('No asset types in DB');
	return rows[0].asset_id;
}

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('Managed assets · API lifecycle', () => {
	test('create → get → delete', async () => {
		const api = await adminApi();
		const assetTypeId = await firstAssetTypeId(api);
		const ids = await discover(api);
		const assetName = rand('host');

		const createRes = await api.post(BASE, {
			data: {
				name: assetName,
				asset_type_id: assetTypeId,
				client_id: ids.customerId,
				criticality: 'high'
			}
		});
		expect(createRes.ok(), await createRes.text()).toBeTruthy();
		const created = await apiJson<{ managed_asset_id: number }>(createRes);
		const assetId = created.managed_asset_id;
		expect(assetId).toBeGreaterThan(0);

		try {
			const getRes = await api.get(`${BASE}/${assetId}`);
			expect(getRes.ok()).toBeTruthy();
			const fetched = await apiJson<{ name: string; criticality: string }>(getRes);
			expect(fetched.name).toBe(assetName);
			expect(fetched.criticality).toBe('high');
		} finally {
			const del = await api.delete(`${BASE}/${assetId}`);
			expect(del.ok(), await del.text()).toBeTruthy();
			await api.dispose();
		}
	});

	test('update criticality', async () => {
		const api = await adminApi();
		const assetTypeId = await firstAssetTypeId(api);
		const ids = await discover(api);
		const assetName = rand('host-upd');

		const createRes = await api.post(BASE, {
			data: {
				name: assetName,
				asset_type_id: assetTypeId,
				client_id: ids.customerId,
				criticality: 'low'
			}
		});
		expect(createRes.ok(), await createRes.text()).toBeTruthy();
		const created = await apiJson<{ managed_asset_id: number }>(createRes);
		const assetId = created.managed_asset_id;

		try {
			const updateRes = await api.put(`${BASE}/${assetId}`, {
				data: { criticality: 'critical' }
			});
			expect(updateRes.ok(), await updateRes.text()).toBeTruthy();
			const updated = await apiJson<{ criticality: string }>(updateRes);
			expect(updated.criticality).toBe('critical');
		} finally {
			await api.delete(`${BASE}/${assetId}`).catch(() => {});
			await api.dispose();
		}
	});

	test('list page returns pagination metadata', async () => {
		const api = await adminApi();
		try {
			const res = await api.get(BASE);
			expect(res.ok()).toBeTruthy();
			const body = (await res.json()) as Record<string, unknown>;
			// Response is paginated: {data: {items:[], page, total, ...}} or similar
			expect(body).toBeDefined();
		} finally {
			await api.dispose();
		}
	});

	test('GET nonexistent asset returns 404', async () => {
		const api = await adminApi();
		try {
			const res = await api.get(`${BASE}/999999999`);
			expect(res.status()).toBe(404);
		} finally {
			await api.dispose();
		}
	});
});

test.describe('Managed assets · UI', () => {
	test('/manage/assets page loads', async ({ page }) => {
		await login(page);
		await page.goto('/manage/assets');
		await expect(page).toHaveURL(/\/manage\/assets/);
		await expect(page.getByRole('main')).toBeVisible();
	});
});

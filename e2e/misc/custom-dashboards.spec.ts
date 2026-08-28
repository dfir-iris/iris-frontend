import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import { adminApi, apiJson } from '../helpers/api';

const DASH_BASE = '/api/v2/custom-dashboards';

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

// Minimal valid dashboard payload accepted by the API.
// The API requires at least one widget with name, chart_type, and fields.
function minimalDashboard(name: string) {
	return {
		name,
		shared: false,
		widgets: [
			{
				name: 'Total alerts',
				chart_type: 'number',
				fields: [{ table: 'alerts', column: 'alert_id', aggregation: 'count', alias: 'total' }]
			}
		]
	};
}

test.describe('Custom dashboards · API lifecycle', () => {
	test('create → get → delete', async () => {
		const api = await adminApi();
		const name = rand('dash');

		const create = await api.post(DASH_BASE, { data: minimalDashboard(name) });
		expect(create.ok(), await create.text()).toBeTruthy();
		const dash = await apiJson<{ dashboard_uuid: string }>(create);
		const uuid = dash.dashboard_uuid;
		expect(uuid).toBeTruthy();

		try {
			const get = await api.get(`${DASH_BASE}/${uuid}`);
			expect(get.ok()).toBeTruthy();
			const fetched = await apiJson<{ name: string }>(get);
			expect(fetched.name).toBe(name);
		} finally {
			await api.delete(`${DASH_BASE}/${uuid}`).catch(() => {});
			await api.dispose();
		}
	});

	test('list returns the created dashboard', async () => {
		const api = await adminApi();
		const name = rand('dash-list');

		const create = await api.post(DASH_BASE, { data: minimalDashboard(name) });
		expect(create.ok(), await create.text()).toBeTruthy();
		const dash = await apiJson<{ dashboard_uuid: string }>(create);

		try {
			const list = await api.get(DASH_BASE);
			expect(list.ok()).toBeTruthy();
			expect(await list.text()).toContain(name);
		} finally {
			await api.delete(`${DASH_BASE}/${dash.dashboard_uuid}`).catch(() => {});
			await api.dispose();
		}
	});

	test('update dashboard name', async () => {
		const api = await adminApi();
		const create = await api.post(DASH_BASE, { data: minimalDashboard(rand('dash-upd')) });
		const dash = await apiJson<{ dashboard_uuid: string }>(create);

		try {
			const newName = rand('renamed');
			const upd = await api.put(`${DASH_BASE}/${dash.dashboard_uuid}`, {
				data: minimalDashboard(newName)
			});
			expect(upd.ok(), await upd.text()).toBeTruthy();
			const updated = await apiJson<{ name: string }>(await api.get(`${DASH_BASE}/${dash.dashboard_uuid}`));
			expect(updated.name).toBe(newName);
		} finally {
			await api.delete(`${DASH_BASE}/${dash.dashboard_uuid}`).catch(() => {});
			await api.dispose();
		}
	});

	test('GET nonexistent dashboard returns 404', async () => {
		const api = await adminApi();
		try {
			const res = await api.get(`${DASH_BASE}/00000000-0000-0000-0000-000000000000`);
			expect(res.status()).toBe(404);
		} finally {
			await api.dispose();
		}
	});
});

test.describe('Custom dashboards · UI', () => {
	test('seeded dashboard is reachable at /dashboards/[uuid]', async ({ page }) => {
		const api = await adminApi();
		const create = await api.post(DASH_BASE, { data: minimalDashboard(rand('dash-ui')) });
		const dash = await apiJson<{ dashboard_uuid: string }>(create);

		try {
			await login(page);
			await page.goto(`/dashboards/${dash.dashboard_uuid}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await api.delete(`${DASH_BASE}/${dash.dashboard_uuid}`).catch(() => {});
			await api.dispose();
		}
	});

	test('dashboard edit page loads', async ({ page }) => {
		const api = await adminApi();
		const create = await api.post(DASH_BASE, { data: minimalDashboard(rand('dash-edit')) });
		const dash = await apiJson<{ dashboard_uuid: string }>(create);

		try {
			await login(page);
			await page.goto(`/dashboards/${dash.dashboard_uuid}/edit`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await api.delete(`${DASH_BASE}/${dash.dashboard_uuid}`).catch(() => {});
			await api.dispose();
		}
	});
});

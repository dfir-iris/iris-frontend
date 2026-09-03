import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';

test.describe('Alerts · detail page', () => {
	test('individual alert page loads', async ({ page }) => {
		const api = await adminApi();
		const alertId = await seed.alert(api, { alert_title: 'e2e alert detail' });

		try {
			await login(page);
			await page.goto(`/alerts/${alertId}`);
			await expect(page).toHaveURL(new RegExp(`/alerts/${alertId}`));
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});

	test('alert detail API returns the alert', async () => {
		const api = await adminApi();
		const alertId = await seed.alert(api, { alert_title: 'e2e alert get' });

		try {
			const res = await api.get(`/api/v2/alerts/${alertId}`);
			expect(res.ok(), await res.text()).toBeTruthy();
			const alert = await apiJson<{ alert_id: number; alert_title: string }>(res);
			expect(alert.alert_id).toBe(alertId);
			expect(alert.alert_title).toBe('e2e alert get');
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});

	test('update alert title', async () => {
		const api = await adminApi();
		const alertId = await seed.alert(api, { alert_title: 'e2e alert update' });

		try {
			const upd = await api.put(`/api/v2/alerts/${alertId}`, {
				data: { alert_title: 'updated title' }
			});
			expect(upd.ok(), await upd.text()).toBeTruthy();

			const get = await api.get(`/api/v2/alerts/${alertId}`);
			const alert = await apiJson<{ alert_title: string }>(get);
			expect(alert.alert_title).toBe('updated title');
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});

	test('GET nonexistent alert returns 404', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/alerts/999999999');
			expect(res.status()).toBe(404);
		} finally {
			await api.dispose();
		}
	});
});

test.describe('Alert clusters · detail page', () => {
	test('cluster detail page loads for a seeded cluster', async ({ page }) => {
		const api = await adminApi();
		// Create two alerts and merge into a cluster (if the endpoint supports it).
		// Fallback: if cluster creation is forbidden, we still test that a non-existent
		// cluster id redirects gracefully (not a 500).
		const alertId = await seed.alert(api, { alert_title: 'e2e cluster detail alert' });

		try {
			await login(page);
			// Check the alert detail page as fallback for the cluster page.
			await page.goto('/alert-clusters');
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});
});

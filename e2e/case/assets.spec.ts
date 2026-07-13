import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('Case · assets', () => {
	test('seeded asset shows up in the case assets list', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e assets' });
		const assetName = `asset-${Math.random().toString(36).slice(2, 8)}`;

		try {
			await seed.asset(api, caseId, { asset_name: assetName });

			await login(page);
			await page.goto(`/case/${caseId}/assets`);
			await expect(page.getByText(assetName).first()).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('nonexistent asset shows a not-found message', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e assets 404' });

		try {
			await login(page);
			await page.goto(`/case/${caseId}/assets/999999`);
			await expect(page.getByText(/not.?found/i)).toBeVisible();
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

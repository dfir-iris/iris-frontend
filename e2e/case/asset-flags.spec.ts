import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, apiJson, seed, cleanup } from '../helpers/api';
import { expectToast } from '../helpers/ui';

// Case · assets: set then remove a status flag from the asset detail view,
// and check the list chip, the flag history and the "Asset status"
// timeline follow.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

interface Timeline {
	timeline_id: number;
	name: string;
}

test.describe('Case · asset flags', () => {
	test('set and remove a flag from the asset detail view', async ({ page }) => {
		const api = await adminApi();
		const flagName = rand('E2E isolated');
		const assetName = rand('flag-asset');

		const flagRes = await api.post('/api/v2/manage/asset-flags', {
			data: { name: flagName, color: 'orange', icon: 'unplug', kind: 'status' }
		});
		expect(flagRes.status(), await flagRes.text()).toBe(201);
		const flagId = (await apiJson<{ id: number }>(flagRes)).id;
		const caseId = await seed.case(api, { case_name: 'e2e asset flags' });

		try {
			const assetId = await seed.asset(api, caseId, { asset_name: assetName });

			await login(page);
			await page.goto(`/case/${caseId}/assets/${assetId}`);

			const strip = page.getByTestId('asset-flags');
			await expect(strip).toBeVisible({ timeout: 10_000 });
			await expect(strip.getByTestId('asset-flags-none')).toBeVisible();
			// No history yet, so no toggle.
			await expect(strip.getByTestId('asset-flag-history-toggle')).toBeHidden();

			const chip = strip.getByTestId('asset-flag-set').filter({ hasText: flagName });
			await expect(chip).toHaveCount(0);
			await strip.getByTestId('asset-flag-add').click();
			await page.getByRole('menuitem', { name: flagName }).click();
			await expectToast(page, `${flagName} set`);
			await expect(chip).toBeVisible();
			await expect(strip.getByTestId('asset-flags-none')).toBeHidden();

			// Folded by default.
			await expect(strip.getByTestId('asset-flag-history')).toBeHidden();
			await strip.getByTestId('asset-flag-history-toggle').click();
			await expect(strip.getByTestId('asset-flag-history')).toContainText(flagName);
			await expect(
				page
					.locator(`#asset-card-${assetId}`)
					.getByTestId('asset-flag-chip')
					.filter({ hasText: flagName })
			).toBeVisible();

			const asset = await apiJson<{ flags: { flag_id: number }[] }>(
				await api.get(`/api/v2/cases/${caseId}/assets/${assetId}`)
			);
			expect(asset.flags.map((f) => f.flag_id)).toContain(flagId);

			// The change landed on the dedicated case timeline.
			const timelines = await apiJson<Timeline[]>(
				await api.get(`/api/v2/cases/${caseId}/timelines`)
			);
			expect(timelines.map((t) => t.name)).toContain('Asset status');

			// Remove it again.
			await strip.getByRole('button', { name: `Remove ${flagName}` }).click();
			await expectToast(page, `${flagName} removed`);
			await expect(chip).toHaveCount(0);
			await expect(strip.getByTestId('asset-flags-none')).toBeVisible();

			const after = await apiJson<{ flags: { flag_id: number }[] }>(
				await api.get(`/api/v2/cases/${caseId}/assets/${assetId}`)
			);
			expect(after.flags.map((f) => f.flag_id)).not.toContain(flagId);
		} finally {
			await cleanup.case(api, caseId);
			await api.delete(`/api/v2/manage/asset-flags/${flagId}`).catch(() => {});
			await api.dispose();
		}
	});
});

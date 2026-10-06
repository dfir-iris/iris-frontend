import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, apiJson, seed, cleanup } from '../helpers/api';
import { expectToast } from '../helpers/ui';

// Case · assets: move an asset along the stage path from its detail view,
// then check the list chip and the stage history follow.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('Case · asset stages', () => {
	test('set a stage from the asset detail view', async ({ page }) => {
		const api = await adminApi();
		const stageName = rand('E2E isolated');
		const assetName = rand('stage-asset');

		const stageRes = await api.post('/api/v2/manage/asset-stages', {
			data: { name: stageName, color: 'orange', icon: 'unplug', kind: 'progress' }
		});
		expect(stageRes.status(), await stageRes.text()).toBe(201);
		const stageId = (await apiJson<{ id: number }>(stageRes)).id;
		const caseId = await seed.case(api, { case_name: 'e2e asset stages' });

		try {
			const assetId = await seed.asset(api, caseId, { asset_name: assetName });

			await login(page);
			await page.goto(`/case/${caseId}/assets/${assetId}`);

			const card = page.getByTestId('asset-stage-card');
			await expect(card).toBeVisible({ timeout: 10_000 });
			await expect(card.getByText('No stage changes yet.')).toBeVisible();

			await card.getByRole('button', { name: `Set stage to ${stageName}` }).click();
			await expectToast(page, `Stage set to ${stageName}`);

			await expect(card.getByRole('button', { name: `Set stage to ${stageName}` })).toHaveAttribute(
				'aria-current',
				'step'
			);
			// Folded by default.
			await expect(card.getByTestId('asset-stage-history')).toBeHidden();
			await card.getByTestId('asset-stage-history-toggle').click();
			await expect(card.getByTestId('asset-stage-history')).toContainText(stageName);
			await expect(
				page
					.locator(`#asset-card-${assetId}`)
					.getByTestId('asset-stage-chip')
					.filter({ hasText: stageName })
			).toBeVisible();

			const asset = await apiJson<{ stage_id: number | null }>(
				await api.get(`/api/v2/cases/${caseId}/assets/${assetId}`)
			);
			expect(asset.stage_id).toBe(stageId);
		} finally {
			await cleanup.case(api, caseId);
			await api.delete(`/api/v2/manage/asset-stages/${stageId}`).catch(() => {});
			await api.dispose();
		}
	});
});

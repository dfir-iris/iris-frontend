import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, apiJson, seed, cleanup } from '../helpers/api';
import { expectToast } from '../helpers/ui';

// War room · Scope: an asset living in one attached case is pushed into a
// second attached case from the Scope tab, then staged from the same view.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('War room · scope', () => {
	test('push an asset to another attached case and set its stage', async ({ page }) => {
		const api = await adminApi();
		const stageName = rand('E2E contained');
		const assetName = rand('scope-asset');

		const stageRes = await api.post('/api/v2/manage/asset-stages', {
			data: { name: stageName, color: 'teal', icon: 'unplug', kind: 'progress' }
		});
		expect(stageRes.status(), await stageRes.text()).toBe(201);
		const stageId = (await apiJson<{ id: number }>(stageRes)).id;

		const wrId = await seed.warRoom(api);
		const caseA = await seed.case(api, { case_name: rand('e2e scope A') });
		const caseB = await seed.case(api, { case_name: rand('e2e scope B') });

		try {
			for (const caseId of [caseA, caseB]) {
				const link = await api.post(`/api/v2/war-rooms/${wrId}/cases`, {
					data: { case_id: caseId }
				});
				expect(link.ok(), await link.text()).toBeTruthy();
			}
			const assetId = await seed.asset(api, caseA, { asset_name: assetName });

			await login(page);
			await page.goto(`/war-rooms/${wrId}/scope`);

			const table = page.getByTestId('scope-assets-table');
			await expect(table).toBeVisible({ timeout: 15_000 });
			const sourceRow = table.locator(
				`[data-testid="scope-asset-row"][data-asset-name="${assetName}"][data-case-id="${caseA}"]`
			);
			await expect(sourceRow).toBeVisible();

			// --- Push to case B ---------------------------------------------
			await sourceRow.getByRole('button', { name: `Push ${assetName} to other cases` }).click();
			const pushDialog = page.getByRole('dialog', { name: `Push ${assetName}` });
			await expect(pushDialog).toBeVisible();
			// The source case is greyed out; case B is the only selectable target.
			await expect(pushDialog.getByLabel(`Target case #${caseA}`, { exact: true })).toBeDisabled();
			await pushDialog.getByLabel(`Target case #${caseB}`, { exact: true }).click();
			await pushDialog.getByRole('button', { name: /^Push/ }).click();

			const outcomes = pushDialog.getByTestId('scope-outcomes');
			await expect(outcomes).toBeVisible({ timeout: 10_000 });
			await expect(outcomes).toContainText('1 created');
			await pushDialog.getByRole('button', { name: 'Done' }).click();
			await expect(pushDialog).toBeHidden();

			const listB = await api.get(`/api/v2/cases/${caseB}/assets?per_page=100`);
			expect(listB.ok(), await listB.text()).toBeTruthy();
			expect(await listB.text()).toContain(assetName);

			// The copy now shows up in the Scope table, flagged as seen in 2 cases.
			const copyRow = table.locator(
				`[data-testid="scope-asset-row"][data-asset-name="${assetName}"][data-case-id="${caseB}"]`
			);
			await expect(copyRow).toBeVisible({ timeout: 10_000 });
			await expect(sourceRow).toContainText('+1 case');

			// --- Set the stage of the source asset ------------------------------
			await sourceRow.getByLabel(`Select ${assetName} in case #${caseA}`, { exact: true }).click();
			const bulkbar = page.getByTestId('scope-assets-bulkbar');
			await expect(bulkbar).toContainText('1 selected');
			await bulkbar.getByRole('button', { name: 'Set stage' }).click();

			const stageDialog = page.getByRole('dialog', { name: 'Set stage' });
			await expect(stageDialog).toBeVisible();
			await stageDialog.getByRole('radio', { name: stageName }).click();
			await stageDialog.getByRole('button', { name: 'Apply to 1 asset' }).click();
			await expectToast(page, `Stage set to ${stageName}`);

			await expect(
				sourceRow.getByTestId('asset-stage-chip').filter({ hasText: stageName })
			).toBeVisible({ timeout: 10_000 });

			const asset = await apiJson<{ stage_id: number | null }>(
				await api.get(`/api/v2/cases/${caseA}/assets/${assetId}`)
			);
			expect(asset.stage_id).toBe(stageId);
		} finally {
			await cleanup.warRoom(api, wrId);
			await cleanup.case(api, caseA);
			await cleanup.case(api, caseB);
			await api.delete(`/api/v2/manage/asset-stages/${stageId}`).catch(() => {});
			await api.dispose();
		}
	});
});

import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, apiJson, seed, cleanup } from '../helpers/api';
import { expectToast } from '../helpers/ui';

// War room · Scope: an asset living in one attached case is pushed into a
// second attached case from the Scope tab, then flagged from the same view.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('War room · scope', () => {
	test('push an asset to another attached case and set a flag on it', async ({ page }) => {
		const api = await adminApi();
		const flagName = rand('E2E isolated');
		const assetName = rand('scope-asset');

		const flagRes = await api.post('/api/v2/manage/asset-flags', {
			data: { name: flagName, color: 'teal', icon: 'unplug', kind: 'status' }
		});
		expect(flagRes.status(), await flagRes.text()).toBe(201);
		const flagId = (await apiJson<{ id: number }>(flagRes)).id;

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

			// --- Set a flag on the source asset -------------------------------
			await sourceRow.getByLabel(`Select ${assetName} in case #${caseA}`, { exact: true }).click();
			const bulkbar = page.getByTestId('scope-assets-bulkbar');
			await expect(bulkbar).toContainText('1 selected');
			await bulkbar.getByRole('button', { name: 'Set flag' }).click();

			const flagDialog = page.getByRole('dialog', { name: 'Set flag' });
			await expect(flagDialog).toBeVisible();
			await flagDialog.getByRole('radio', { name: flagName }).click();
			await flagDialog.getByRole('button', { name: 'Apply to 1 asset' }).click();
			await expectToast(page, `${flagName} set`);

			await expect(
				sourceRow.getByTestId('asset-flag-chip').filter({ hasText: flagName })
			).toBeVisible({ timeout: 10_000 });

			const asset = await apiJson<{ flags: { flag_id: number }[] }>(
				await api.get(`/api/v2/cases/${caseA}/assets/${assetId}`)
			);
			expect(asset.flags.map((f) => f.flag_id)).toContain(flagId);
			// The copy in case B is untouched: flags are per case.
			type Listed = { asset_name: string; flags?: unknown[] };
			const copies = await apiJson<Listed[] | { data: Listed[] }>(
				await api.get(`/api/v2/cases/${caseB}/assets?per_page=100`)
			);
			const copy = (Array.isArray(copies) ? copies : copies.data).find(
				(a) => a.asset_name === assetName
			);
			expect(copy).toBeDefined();
			expect(copy?.flags ?? []).toHaveLength(0);
		} finally {
			await cleanup.warRoom(api, wrId);
			await cleanup.case(api, caseA);
			await cleanup.case(api, caseB);
			await api.delete(`/api/v2/manage/asset-flags/${flagId}`).catch(() => {});
			await api.dispose();
		}
	});
});

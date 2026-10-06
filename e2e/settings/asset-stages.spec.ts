import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, apiJson } from '../helpers/api';
import { expectToast, openDialog } from '../helpers/ui';

// Settings · asset stages: create, edit and delete a stage through the UI.
// Presets are not exercised here — they replace the whole taxonomy, which
// would clobber stages other specs (or a real deployment) rely on.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

interface Stage {
	id: number;
	name: string;
	kind: string;
	requires_reason: boolean;
}

test.describe('Settings · asset stages', () => {
	test('create → edit → delete a stage', async ({ page }) => {
		const api = await adminApi();
		const name = rand('E2E stage');
		const renamed = `${name}-edited`;
		const findStage = async (n: string) => {
			const res = await api.get('/api/v2/manage/asset-stages');
			expect(res.ok(), await res.text()).toBeTruthy();
			return (await apiJson<Stage[]>(res)).find((s) => s.name === n);
		};

		try {
			await login(page);
			await page.goto('/settings/asset-stages');
			await expect(page.getByTestId('asset-stages-list')).toBeVisible({ timeout: 10_000 });

			// Create.
			await page.getByRole('button', { name: 'Add stage' }).click();
			let dialog = await openDialog(page, 'Add stage');
			await dialog.getByLabel('Name').fill(name);
			await dialog.getByRole('radio', { name: /Exception/ }).click();
			await dialog.getByRole('switch', { name: /Requires a reason/ }).click();
			await dialog.getByRole('button', { name: 'Create' }).click();
			await expectToast(page, `Stage "${name}" created`);

			const row = page.getByTestId('asset-stage-row').filter({ hasText: name });
			await expect(row).toBeVisible();
			const created = await findStage(name);
			expect(created).toMatchObject({ kind: 'exception', requires_reason: true });

			// Edit.
			await row.locator('button[aria-pressed]').click();
			await page.getByRole('button', { name: 'Edit', exact: true }).click();
			dialog = await openDialog(page, 'Edit stage');
			await dialog.getByLabel('Name').fill(renamed);
			await dialog.getByRole('button', { name: 'Save' }).click();
			await expectToast(page, 'Stage saved');
			await expect(page.getByTestId('asset-stage-row').filter({ hasText: renamed })).toBeVisible();
			expect((await findStage(renamed))?.id).toBe(created?.id);

			// Delete.
			await page.getByRole('button', { name: 'Delete', exact: true }).click();
			const confirm = await openDialog(page, `Delete stage "${renamed}"?`);
			await confirm.getByRole('button', { name: 'Delete' }).click();
			await expectToast(page, 'Stage deleted');
			await expect(page.getByTestId('asset-stage-row').filter({ hasText: renamed })).toHaveCount(0);
			expect(await findStage(renamed)).toBeUndefined();
		} finally {
			for (const n of [name, renamed]) {
				const left = await findStage(n).catch(() => undefined);
				if (left) await api.delete(`/api/v2/manage/asset-stages/${left.id}`).catch(() => {});
			}
			await api.dispose();
		}
	});
});

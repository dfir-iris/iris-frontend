import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, apiJson } from '../helpers/api';
import { expectToast, openDialog } from '../helpers/ui';

// Settings · asset flags: create, edit and delete a flag through the UI.
// Presets are not exercised here — they replace the whole taxonomy, which
// would clobber flags other specs (or a real deployment) rely on.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

interface Flag {
	id: number;
	name: string;
	kind: string;
	requires_reason: boolean;
}

test.describe('Settings · asset flags', () => {
	test('create → edit → delete a flag', async ({ page }) => {
		const api = await adminApi();
		const name = rand('E2E flag');
		const renamed = `${name}-edited`;
		const findFlag = async (n: string) => {
			const res = await api.get('/api/v2/manage/asset-flags');
			expect(res.ok(), await res.text()).toBeTruthy();
			return (await apiJson<Flag[]>(res)).find((f) => f.name === n);
		};

		try {
			await login(page);
			await page.goto('/settings/asset-flags');
			await expect(page.getByTestId('asset-flags-list')).toBeVisible({ timeout: 10_000 });

			// Create.
			await page.getByRole('button', { name: 'Add flag' }).click();
			let dialog = await openDialog(page, 'Add flag');
			await dialog.getByLabel('Name').fill(name);
			await dialog.getByRole('radio', { name: /Exception/ }).click();
			await dialog.getByRole('switch', { name: /Requires a reason/ }).click();
			await dialog.getByRole('button', { name: 'Create' }).click();
			await expectToast(page, `Flag "${name}" created`);

			const row = page.getByTestId('asset-flag-row').filter({ hasText: name });
			await expect(row).toBeVisible();
			const created = await findFlag(name);
			expect(created).toMatchObject({ kind: 'exception', requires_reason: true });

			// Edit.
			await row.locator('button[aria-pressed]').click();
			await page.getByRole('button', { name: 'Edit', exact: true }).click();
			dialog = await openDialog(page, 'Edit flag');
			await dialog.getByLabel('Name').fill(renamed);
			await dialog.getByRole('button', { name: 'Save' }).click();
			await expectToast(page, 'Flag saved');
			await expect(page.getByTestId('asset-flag-row').filter({ hasText: renamed })).toBeVisible();
			expect((await findFlag(renamed))?.id).toBe(created?.id);

			// Delete.
			await page.getByRole('button', { name: 'Delete', exact: true }).click();
			const confirm = await openDialog(page, `Delete flag "${renamed}"?`);
			await confirm.getByRole('button', { name: 'Delete' }).click();
			await expectToast(page, 'Flag deleted');
			await expect(page.getByTestId('asset-flag-row').filter({ hasText: renamed })).toHaveCount(0);
			expect(await findFlag(renamed)).toBeUndefined();
		} finally {
			for (const n of [name, renamed]) {
				const left = await findFlag(n).catch(() => undefined);
				if (left) await api.delete(`/api/v2/manage/asset-flags/${left.id}`).catch(() => {});
			}
			await api.dispose();
		}
	});
});

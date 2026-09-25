import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, apiJson, seed, cleanup } from '../helpers/api';
import { openDialog } from '../helpers/ui';

/**
 * The split view's status menu — the cockpit counterpart of the list
 * view's "Set status" dropdown. Before it, moving an alert from New to
 * In progress meant leaving the view an analyst triages in.
 *
 * Asserted on both ends: the trigger doubles as the status read-out, so
 * it has to follow the write, and the write has to reach the API rather
 * than only repaint the header.
 *
 * Closed is the exception and has its own test. It is not a status the
 * menu writes — the resolution status and the closing note only exist in
 * the Close dialog, so that entry has to hand over to it rather than
 * quietly close the alert with both unset.
 */

const token = () => `e2est${Math.random().toString(36).slice(2, 8)}`;

test.describe('Alerts · split view · status', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('the status menu moves the focused alert to another status', async ({ page }) => {
		const api = await adminApi();
		const tag = token();
		const title = `${tag} status alert`;
		const alertId = await seed.alert(api, { alert_title: title });

		try {
			// Split is the default view at /alerts, so no `view=`. `query=` does
			// name a filter, which is what keeps the stored default view from
			// also applying; the queue then auto-focuses its first row — this
			// alert, since the tag is unique to it.
			await page.goto(`/alerts?query=${encodeURIComponent(tag)}`);
			await expect(page.getByText(title, { exact: true }).first()).toBeVisible({
				timeout: 15_000
			});

			const statusMenu = page.locator('[data-menu="status"]');
			const trigger = statusMenu.locator('button.btn-status');
			await expect(trigger).toBeVisible();

			// Whichever status the seed landed on — `seed.alert` takes the first
			// the API lists, which is not the same row on every stack.
			const current = ((await trigger.textContent()) ?? '').replace(/[●▾]/g, '').trim();

			await trigger.click();

			const items = statusMenu.locator('.menu-item');
			await expect(items.first()).toBeVisible();

			const labels = (await items.allTextContents()).map((label) => label.trim());
			// Closed is the one entry that does not write a status — it opens
			// the Close dialog, which the test below covers.
			const next = labels.find((label) => label !== current && !label.startsWith('Closed'));
			if (!next) {
				throw new Error(`expected another non-closing alert status, got: ${labels.join(', ')}`);
			}

			await statusMenu.getByRole('menuitem', { name: next, exact: true }).click();

			await expect(trigger).toContainText(next);

			const read = await api.get(`/api/v2/alerts/${alertId}`);
			expect(read.ok(), await read.text()).toBeTruthy();
			const alert = await apiJson<{ status?: { status_name?: string } }>(read);
			expect(alert.status?.status_name).toBe(next);
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});

	test('the Closed entry opens the Close dialog instead of writing the status', async ({
		page
	}) => {
		const api = await adminApi();
		const tag = token();
		const title = `${tag} closing alert`;
		const alertId = await seed.alert(api, { alert_title: title });

		try {
			await page.goto(`/alerts?query=${encodeURIComponent(tag)}`);
			await expect(page.getByText(title, { exact: true }).first()).toBeVisible({
				timeout: 15_000
			});

			const statusMenu = page.locator('[data-menu="status"]');
			await statusMenu.locator('button.btn-status').click();

			// Carries the ellipsis this pane uses for "opens a dialog".
			await statusMenu.getByRole('menuitem', { name: 'Closed…', exact: true }).click();

			// The resolution status and the closing note only exist here — a
			// bare status write would have left both unset.
			const dialog = await openDialog(page, /^Close alert$/);
			await expect(dialog.getByText('Resolution status', { exact: true })).toBeVisible();
			await expect(dialog.locator('#close-alert-note')).toBeVisible();

			const read = await api.get(`/api/v2/alerts/${alertId}`);
			expect(read.ok(), await read.text()).toBeTruthy();
			const alert = await apiJson<{ status?: { status_name?: string } }>(read);
			expect(alert.status?.status_name).not.toBe('Closed');
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});
});

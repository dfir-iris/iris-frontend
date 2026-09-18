import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

/**
 * Alert descriptions and closing notes are markdown, and the split view
 * used to render both as raw text — so the same alert read one way in the
 * list (which has always rendered the card's description through
 * `MarkDownPreview`) and another way in the cockpit, `**like this**`.
 *
 * Asserted on the produced elements rather than on the absence of
 * asterisks: `<strong>` can only be there if the markdown pipeline ran.
 */

const token = () => `e2emd${Math.random().toString(36).slice(2, 8)}`;

const DESCRIPTION = '**escalated** by the pipeline\n\n- matched sigma rule\n- two hosts affected';
const NOTE = '**contained**\n\n- host isolated\n- credentials rotated';

test.describe('Alerts · split view · markdown', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('the description and the closing note render as markdown', async ({ page }) => {
		const api = await adminApi();
		const tag = token();
		const title = `${tag} markdown alert`;
		const alertId = await seed.alert(api, {
			alert_title: title,
			alert_description: DESCRIPTION
		});

		try {
			// The note is what the close dialog writes. Set over the API so the
			// test is about rendering it, not about closing an alert.
			const noted = await api.put(`/api/v2/alerts/${alertId}`, { data: { alert_note: NOTE } });
			expect(noted.ok(), await noted.text()).toBeTruthy();

			// Split is the default view at /alerts, so no `view=`. `query=` does
			// name a filter, which is what keeps the stored default view from
			// also applying; the queue then auto-focuses its first row — this
			// alert, since the tag is unique to it.
			await page.goto(`/alerts?query=${encodeURIComponent(tag)}`);
			await expect(page.getByText(title, { exact: true }).first()).toBeVisible({
				timeout: 15_000
			});

			await expect(page.locator('.detail-prose strong')).toHaveText('escalated');
			await expect(page.locator('.detail-prose li')).toHaveCount(2);

			await page.getByRole('tab', { name: /^Notes/ }).click();

			await expect(page.locator('.note strong')).toHaveText('contained');
			await expect(page.locator('.note li')).toHaveCount(2);
		} finally {
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});
});

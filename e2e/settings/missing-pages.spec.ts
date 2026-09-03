import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';

// Settings pages that were absent from shell.spec.ts.

test.describe('Settings · missing pages', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	for (const route of ['/settings/banners', '/settings/chatbot', '/settings/mcp']) {
		test(`${route} loads`, async ({ page }) => {
			await page.goto(route);
			await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
		});
	}
});

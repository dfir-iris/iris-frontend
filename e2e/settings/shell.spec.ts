import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';

test.describe('Settings · shell', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	// Each entry is a settings subroute. We only test that the page loads
	// with a main content area — deeper interaction lives in per-feature
	// specs (users, customers, modules, ...).
	const routes = [
		'/settings',
		'/settings/modules',
		'/settings/customers',
		'/settings/case-objects',
		'/settings/custom-attributes',
		'/settings/case-templates',
		'/settings/report-templates',
		'/settings/access-control',
		'/settings/notifications',
		'/settings/mail',
		'/settings/cluster-rules',
		'/settings/investigation-flows',
		'/settings/server'
	];

	for (const route of routes) {
		test(`${route} loads`, async ({ page }) => {
			await page.goto(route);
			await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
		});
	}
});

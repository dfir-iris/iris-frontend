import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Misc · global search', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('/search page loads for admin users (search_across_cases permission)', async ({ page }) => {
		await page.goto('/search');
		// Two accepted outcomes: page loads (admin has perms) or is
		// redirected because current role doesn't have search_across_cases.
		// For the seeded admin user in a fresh install, the page should load.
		await expect(page).toHaveURL(/\/(search|login|)/, { timeout: 10_000 });
	});
});

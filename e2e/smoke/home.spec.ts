import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';

test('home page title mentions Dashboard', async ({ page }) => {
	await login(page);
	await page.goto('/');
	await expect(page).toHaveTitle(/Dashboard/);
});

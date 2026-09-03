import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';

test.describe('Auth · session', () => {
	test('visiting a protected route while unauthenticated redirects to /login', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');
		await expect(page).toHaveURL(/\/login/);
	});

	test('reloading an authenticated page keeps the session alive', async ({ page }) => {
		await login(page);
		await page.goto('/');
		await page.reload();
		await expect(page).not.toHaveURL(/\/login/);
		await expect(page.getByRole('main')).toBeVisible();
	});
});

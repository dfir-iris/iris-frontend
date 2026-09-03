import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';

test.describe('Misc · profile', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('/profile page loads and shows the user info', async ({ page }) => {
		await page.goto('/profile');
		await expect(page).toHaveURL(/\/profile/);
		await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
	});

	test('/profile/notifications page loads', async ({ page }) => {
		await page.goto('/profile/notifications');
		await expect(page).toHaveURL(/\/profile\/notifications/);
		await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
	});
});

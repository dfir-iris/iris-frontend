import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Alerts · list', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('/alerts loads with the alerts page shell', async ({ page }) => {
		await page.goto('/alerts');
		await expect(page).toHaveURL(/\/alerts/);
		await expect(page.getByRole('main')).toBeVisible();
	});
});

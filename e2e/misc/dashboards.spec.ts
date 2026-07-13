import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Misc · custom dashboards', () => {
	test('/dashboards page loads', async ({ page }) => {
		await login(page);
		await page.goto('/dashboards');
		await expect(page).toHaveURL(/\/dashboards/);
		await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
	});
});

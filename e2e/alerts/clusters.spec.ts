import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';

test.describe('Alert clusters · list', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('/alert-clusters loads', async ({ page }) => {
		await page.goto('/alert-clusters');
		await expect(page).toHaveURL(/\/alert-clusters/);
		await expect(page.getByRole('main')).toBeVisible();
	});
});

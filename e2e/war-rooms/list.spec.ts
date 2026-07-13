import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('War rooms · list', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('/war-rooms page loads', async ({ page }) => {
		await page.goto('/war-rooms');
		await expect(page).toHaveURL(/\/war-rooms/);
		await expect(page.getByRole('main')).toBeVisible();
	});
});

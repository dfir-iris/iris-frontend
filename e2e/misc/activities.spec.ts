import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';

test.describe('Misc · activities + dim tasks', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('/activities loads', async ({ page }) => {
		await page.goto('/activities');
		await expect(page).toHaveURL(/\/activities/);
		await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
	});

	test('/dim-tasks loads', async ({ page }) => {
		await page.goto('/dim-tasks');
		await expect(page).toHaveURL(/\/dim-tasks/);
		await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
	});
});

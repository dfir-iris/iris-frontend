import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';

// Pages that have no coverage at all: /welcome, /api-docs, /manage/cases,
// /cases/import, /profile/notifications (already covered but grouped here
// for completeness of the missing-page sweep).

test.describe('Misc · other pages', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('/api-docs loads the API documentation', async ({ page }) => {
		await page.goto('/api-docs');
		await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
	});

	test('/manage/assets page loads', async ({ page }) => {
		await page.goto('/manage/assets');
		await expect(page).toHaveURL(/\/manage\/assets/);
		await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
	});

	test('/manage/cases page loads', async ({ page }) => {
		await page.goto('/manage/cases');
		await expect(page).toHaveURL(/\/manage\/cases/);
		await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
	});

	test('/cases/import page loads', async ({ page }) => {
		await page.goto('/cases/import');
		await expect(page).toHaveURL(/\/cases\/import/);
		await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
	});

	test('/welcome page loads', async ({ page }) => {
		await page.goto('/welcome');
		await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
	});
});

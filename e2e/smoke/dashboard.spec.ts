import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Dashboard smoke', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('shows the main content area with greeting + KPI cards', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('main')).toBeVisible();
		// The home page greets the user by name (h1) — this is stable across
		// installs because the current user's login is always non-empty.
		await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
		// "My open cases" is a KPI card that always renders (even when count = 0).
		await expect(page.getByRole('link', { name: /my open cases/i })).toBeVisible();
	});

	test('has a Refresh dashboard button', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('button', { name: 'Refresh dashboard' })).toBeVisible();
	});
});

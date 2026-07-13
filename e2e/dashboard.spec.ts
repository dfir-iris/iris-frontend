import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Dashboard', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('renders the dashboard header + owned-cases panel', async ({ page }) => {
		await page.goto('/');
		await expect(page.getByRole('banner')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Owned Cases' })).toBeVisible();
	});
});

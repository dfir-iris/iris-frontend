import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test('home page title is Dashboard | DFIR-IRIS', async ({ page }) => {
	await login(page);
	await page.goto('/');
	await expect(page).toHaveTitle('Dashboard | DFIR-IRIS');
});

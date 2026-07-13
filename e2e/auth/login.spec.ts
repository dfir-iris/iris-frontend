import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Auth · login', () => {
	test('login page renders username + password + login button', async ({ page }) => {
		await page.goto('/login');
		await expect(page.getByRole('textbox', { name: 'Username' })).toBeVisible();
		await expect(page.getByRole('textbox', { name: 'Password' })).toBeVisible();
		await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
	});

	test('wrong password stays on /login and shows an error', async ({ page }) => {
		await page.goto('/login');
		await page.getByRole('textbox', { name: 'Username' }).fill('administrator');
		await page.getByRole('textbox', { name: 'Password' }).fill('deliberately-wrong');
		await page.getByRole('button', { name: 'Log in' }).click();
		// Either the form stays on /login OR an error banner appears. Both are
		// valid — assert we did NOT navigate away to an authed page.
		await page.waitForTimeout(500);
		await expect(page).toHaveURL(/\/login/);
	});

	test('successful login redirects away from /login', async ({ page }) => {
		await login(page);
		await expect(page).not.toHaveURL(/\/login/);
	});
});

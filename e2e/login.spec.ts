import { test, expect } from '@playwright/test';
import { login } from './helpers/auth';

test.describe('Login', () => {
	test('successful login redirects away from /login', async ({ page }) => {
		await login(page);
		await expect(page).not.toHaveURL(/\/login/);
	});
});

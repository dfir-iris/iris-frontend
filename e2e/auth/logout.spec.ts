import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Auth · logout', () => {
	test('clearing browser storage (cookies + localStorage) drops the session', async ({
		page
	}) => {
		// The SvelteKit UI keeps its JWTs in localStorage as well as cookies —
		// clearing cookies alone isn't enough to invalidate the session client-
		// side. Wipe both then reload.
		await login(page);
		await page.context().clearCookies();
		await page.evaluate(() => {
			try {
				localStorage.clear();
				sessionStorage.clear();
			} catch {
				// noop — some sandbox contexts refuse storage clear
			}
		});
		await page.goto('/');
		await expect(page).toHaveURL(/\/login/);
	});
});

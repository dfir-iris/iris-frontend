import { type Page, expect } from '@playwright/test';

const DEFAULT_USERNAME = process.env.IRIS_E2E_USERNAME ?? 'administrator';
const DEFAULT_PASSWORD = process.env.IRIS_E2E_PASSWORD ?? 'MySuperAdminPassword!';

// Log the browser session in via the real /login form. Relies on the
// baseURL from playwright.config.ts pointing at the running stack.
export async function login(
	page: Page,
	username: string = DEFAULT_USERNAME,
	password: string = DEFAULT_PASSWORD
) {
	await page.goto('/login');
	await page.getByRole('textbox', { name: 'Username' }).fill(username);
	await page.getByRole('textbox', { name: 'Password' }).fill(password);
	await page.getByRole('button', { name: 'Log in' }).click();
	// Any authenticated route works; the dashboard is the canonical
	// post-login landing.
	await expect(page).not.toHaveURL(/\/login/);
}

// Back-compat alias for older specs; new specs should use `login`.
export const loginAsTestUser = login;

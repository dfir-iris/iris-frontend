import { type Page, expect } from '@playwright/test';

const DEFAULT_USERNAME = process.env.IRIS_E2E_USERNAME ?? 'administrator';
const DEFAULT_PASSWORD = process.env.IRIS_E2E_PASSWORD ?? 'MySuperAdminPassword!';

// The account `login()` uses by default. Exported so specs can assert on
// what the UI renders for the logged-in user (the sidebar user chip shows
// "Loading..." until `/whoami` resolves) without re-deriving the env var.
export const E2E_USERNAME = DEFAULT_USERNAME;

// Log the browser session in via the real /login form. Relies on the
// baseURL from playwright.config.ts pointing at the running stack.
//
// The form uses SvelteKit's `use:enhance` — that handler is only wired
// AFTER hydration completes. Clicking before hydration causes a native
// form POST, which the SvelteKit action responds to with a re-rendered
// login page HTML (not a redirect), and we get stuck. So we wait for
// hydration by waiting for the Log-in button to be enabled AND for
// networkidle before submitting.
export async function login(
	page: Page,
	username: string = DEFAULT_USERNAME,
	password: string = DEFAULT_PASSWORD
): Promise<void> {
	await page.goto('/login', { waitUntil: 'networkidle' });
	await page.getByRole('textbox', { name: 'Username' }).fill(username);
	await page.getByRole('textbox', { name: 'Password' }).fill(password);
	await Promise.all([
		page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 15_000 }),
		page.getByRole('button', { name: 'Log in' }).click()
	]);
	await expect(page).not.toHaveURL(/\/login$/);
}

// Back-compat alias for older specs.
export const loginAsTestUser = login;

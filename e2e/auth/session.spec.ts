import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';

test.describe('Auth · session', () => {
	test('visiting a protected route while unauthenticated redirects to /login', async ({ page }) => {
		await page.context().clearCookies();
		await page.goto('/');
		await expect(page).toHaveURL(/\/login/);
	});

	test('reloading an authenticated page keeps the session alive', async ({ page }) => {
		await login(page);
		await page.goto('/');
		await page.reload();
		await expect(page).not.toHaveURL(/\/login/);
		await expect(page.getByRole('main')).toBeVisible();
	});

	test('a protected deep link returns the user to the requested page after login', async ({
		page
	}) => {
		const username = process.env.IRIS_E2E_USERNAME ?? 'administrator';
		const password = process.env.IRIS_E2E_PASSWORD ?? 'MySuperAdminPassword!';

		// Start from an app page so localStorage is reachable, then wipe the
		// whole session (cookies + expiry timestamps), as logout.spec.ts does.
		await page.goto('/login', { waitUntil: 'networkidle' });
		await page.context().clearCookies();
		await page.evaluate(() => {
			try {
				localStorage.clear();
				sessionStorage.clear();
			} catch {
				// noop — some sandbox contexts refuse storage clear
			}
		});

		await page.goto('/cases');
		await expect(page).toHaveURL(/\/login\?redirect=%2Fcases/);

		// The form's `use:enhance` handler is only wired after hydration (see
		// e2e/helpers/auth.ts), so let the login page settle before submitting.
		await page.waitForLoadState('networkidle');

		await page.getByRole('textbox', { name: 'Username' }).fill(username);
		await page.getByRole('textbox', { name: 'Password' }).fill(password);
		await Promise.all([
			page.waitForURL((url) => url.pathname === '/cases', { timeout: 15_000 }),
			page.getByRole('button', { name: 'Log in' }).click()
		]);

		await expect(page).toHaveURL(/\/cases$/);
		await expect(page.getByRole('main')).toBeVisible();
	});
});

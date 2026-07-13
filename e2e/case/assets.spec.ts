import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.describe('Case assets (authenticated)', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('nonexistent asset shows a not-found message', async ({ page }) => {
		// Case #1 exists on every fresh DFIR-IRIS install (default seed).
		// Asset 999999 will not.
		await page.goto('/case/1/assets/999999');
		await expect(page.getByText(/not.?found/i)).toBeVisible();
	});
});

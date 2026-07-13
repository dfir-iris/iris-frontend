import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('Complex flow · case context switch', () => {
	test('current case indicator changes when navigating to a new case', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'switched to' });

		try {
			await login(page);
			// Go home first to establish a "current case" (Initial Demo or
			// whatever the topbar shows).
			await page.goto('/');
			await expect(page.getByRole('main').first()).toBeVisible();

			// Now open the seeded case — the case-switcher indicator in the
			// topbar should update to reflect this case.
			await page.goto(`/case/${caseId}`);
			await expect(page.locator('body')).toContainText(`#${caseId}`, { timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

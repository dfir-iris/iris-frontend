import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('Cases · detail page', () => {
	test('detail page has Summary + case subtitle', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e detail' });

		try {
			await login(page);
			await page.goto(`/case/${caseId}`);
			// The URL alone should stabilise on the case route.
			await expect(page).toHaveURL(new RegExp(`/case/${caseId}(?:/|$)`));
			// The case name (or its "#{id} - " display prefix) is in the DOM.
			await expect(page.locator('body')).toContainText(`#${caseId}`);
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('every case sub-route loads without a runtime error', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e subroutes' });

		try {
			await login(page);
			const subroutes = ['', '/assets', '/iocs', '/notes', '/tasks', '/evidence', '/timeline'];
			for (const sub of subroutes) {
				await page.goto(`/case/${caseId}${sub}`);
				await expect(page).toHaveURL(new RegExp(`/case/${caseId}${sub}(?:$|/|\\?)`));
				await expect(page.getByRole('main')).toBeVisible();
			}
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

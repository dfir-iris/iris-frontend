import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';

test.describe('Complex flow · close/reopen via API, verify in UI', () => {
	test('closed case shows a closed state on the detail page', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e close-reopen' });

		try {
			const closeRes = await api.post(`/api/v2/cases/${caseId}/close`, { data: {} });
			expect(closeRes.ok(), await closeRes.text()).toBeTruthy();

			await login(page);
			await page.goto(`/case/${caseId}`);
			// The topbar shows "closed" state chip somewhere in the DOM
			// once the case is closed.
			await expect(page.locator('body')).toContainText(/closed/i, { timeout: 10_000 });

			await api.post(`/api/v2/cases/${caseId}/reopen`, { data: {} });

			// After reopen, the API-side close_date should be null.
			const reopened = await apiJson<{ close_date: string | null }>(
				await api.get(`/api/v2/cases/${caseId}`)
			);
			expect(reopened.close_date).toBeNull();
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

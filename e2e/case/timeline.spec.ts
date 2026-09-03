import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('Case · timeline', () => {
	test('timeline page loads for a seeded case', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e timeline' });

		try {
			await login(page);
			await page.goto(`/case/${caseId}/timeline`);
			await expect(page).toHaveURL(new RegExp(`/case/${caseId}/timeline`));
			await expect(page.getByRole('main')).toBeVisible();
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

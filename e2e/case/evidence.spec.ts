import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('Case · evidence', () => {
	test('seeded evidence shows up in the evidence list', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e evidence' });
		const filename = `evidence-${Math.random().toString(36).slice(2, 8)}.bin`;

		try {
			await seed.evidence(api, caseId, { filename });

			await login(page);
			await page.goto(`/case/${caseId}/evidence`);
			await expect(page.getByText(filename).first()).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

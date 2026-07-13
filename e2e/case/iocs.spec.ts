import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('Case · IOCs', () => {
	test('seeded IOC shows up in the case IOCs list', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e iocs' });
		const iocValue = `ioc.${Math.random().toString(36).slice(2, 8)}.example.com`;

		try {
			await seed.ioc(api, caseId, { ioc_value: iocValue });

			await login(page);
			await page.goto(`/case/${caseId}/iocs`);
			await expect(page.getByText(iocValue).first()).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

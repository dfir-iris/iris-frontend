import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('Cases · seed via API and open in UI', () => {
	test('seeded case is reachable at /case/<id>', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, {
			case_name: 'Seeded by e2e',
			case_description: 'e2e-seed-open'
		});

		try {
			await login(page);
			await page.goto(`/case/${caseId}`);
			// The case detail page shows the case ID in the title / topbar.
			// #<id> is the canonical display everywhere in the UI.
			await expect(page.locator('body')).toContainText(`#${caseId}`);
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('Complex flow · case populated with data', () => {
	test('case with asset + IOC + task shows each on their respective pages', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e flow' });
		const assetName = `asset-${Math.random().toString(36).slice(2, 8)}`;
		const iocValue = `ioc.${Math.random().toString(36).slice(2, 8)}.example.com`;
		const taskTitle = `task-${Math.random().toString(36).slice(2, 8)}`;

		try {
			await seed.asset(api, caseId, { asset_name: assetName });
			await seed.ioc(api, caseId, { ioc_value: iocValue });
			await seed.task(api, caseId, { task_title: taskTitle });

			await login(page);

			await page.goto(`/case/${caseId}/assets`);
			await expect(page.getByText(assetName).first()).toBeVisible({ timeout: 10_000 });

			await page.goto(`/case/${caseId}/iocs`);
			await expect(page.getByText(iocValue).first()).toBeVisible({ timeout: 10_000 });

			await page.goto(`/case/${caseId}/tasks`);
			await expect(page.getByText(taskTitle).first()).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

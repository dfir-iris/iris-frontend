import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('Case · tasks', () => {
	test('seeded task shows up in the case tasks page', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e tasks' });
		const taskTitle = `task-${Math.random().toString(36).slice(2, 8)}`;

		try {
			await seed.task(api, caseId, { task_title: taskTitle });

			await login(page);
			await page.goto(`/case/${caseId}/tasks`);
			await expect(page.getByText(taskTitle).first()).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

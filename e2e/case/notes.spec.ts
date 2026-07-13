import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('Case · notes', () => {
	test('seeded note shows up in the case notes tree', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e notes' });
		const noteTitle = `note-${Math.random().toString(36).slice(2, 8)}`;

		try {
			await seed.note(api, caseId, { note_title: noteTitle, note_content: '# hello' });

			await login(page);
			await page.goto(`/case/${caseId}/notes`);
			await expect(page.getByText(noteTitle).first()).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

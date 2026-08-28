import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

// War room → linked cases sub-page, and the API for linking/unlinking cases.

test.describe('War room · linked cases', () => {
	test('/war-rooms/[id]/cases page loads', async ({ page }) => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);

		try {
			await login(page);
			await page.goto(`/war-rooms/${wrId}/cases`);
			await expect(page).toHaveURL(new RegExp(`/war-rooms/${wrId}/cases`));
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});

	test('link a case to a war room via API', async () => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);
		const caseId = await seed.case(api, { case_name: 'e2e wr link' });

		try {
			const link = await api.post(`/api/v2/war-rooms/${wrId}/cases`, {
				data: { case_id: caseId }
			});
			// Accept 200/201 — the exact status varies by implementation.
			expect(link.ok(), await link.text()).toBeTruthy();

			// Verify the case appears in the war room's case list.
			const list = await api.get(`/api/v2/war-rooms/${wrId}/cases`);
			expect(list.ok()).toBeTruthy();
			expect(await list.text()).toContain(String(caseId));
		} finally {
			await cleanup.case(api, caseId);
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});
});

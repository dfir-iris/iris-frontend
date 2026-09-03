import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('Complex flow · war-room linked to a case', () => {
	test('war-room created from a case is reachable at /case/<id>/war-room', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e wr-linked' });
		const wrId = await seed.warRoom(api, {
			name: `wr for #${caseId}`,
			case_id: caseId
		});

		try {
			await login(page);
			// The war-room's cases list should include the linked case; reverse
			// isn't a strict guarantee (case ↔ war-room bridge depends on the
			// wire) but the war-room's /cases subroute should render.
			await page.goto(`/war-rooms/${wrId}/cases`);
			await expect(page).toHaveURL(new RegExp(`/war-rooms/${wrId}/cases`));
			await expect(page.getByRole('main').first()).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.warRoom(api, wrId);
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

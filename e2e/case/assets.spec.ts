import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('Case · assets', () => {
	test('seeded asset shows up in the case assets list', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e assets' });
		const assetName = `asset-${Math.random().toString(36).slice(2, 8)}`;

		try {
			await seed.asset(api, caseId, { asset_name: assetName });

			await login(page);
			await page.goto(`/case/${caseId}/assets`);
			await expect(page.getByText(assetName).first()).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	// Regression: (app)/+layout's scroll viewport became a *column* flex
	// container, so the case layout's root was sized on the main axis and its
	// default `min-height: auto` let it outgrow the viewport. The whole page
	// scrolled instead of the sidebar, which also broke the sidebar's
	// IntersectionObserver infinite scroll (the sentinel was permanently in
	// view). Assert the scroll stays *inside* the sidebar pane.
	test('assets sidebar scrolls internally rather than scrolling the page', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e assets scroll' });

		try {
			// Enough rows to comfortably overflow the sidebar at any viewport.
			for (let i = 0; i < 40; i++) {
				await seed.asset(api, caseId, { asset_name: `scroll-asset-${i}` });
			}

			await login(page);
			await page.goto(`/case/${caseId}/assets`);

			const sidebar = page.getByTestId('assets-scroll-container');
			await expect(sidebar).toBeVisible({ timeout: 10_000 });
			await expect(page.getByText('scroll-asset-0').first()).toBeVisible({ timeout: 10_000 });

			// The sidebar owns the overflow...
			await expect
				.poll(() => sidebar.evaluate((el) => el.scrollHeight - el.clientHeight), {
					timeout: 10_000
				})
				.toBeGreaterThan(0);

			// ...and the page-level viewport does not scroll vertically.
			const viewport = page.getByTestId('app-scroll-viewport');
			const pageOverflow = await viewport.evaluate((el) => el.scrollHeight - el.clientHeight);
			expect(pageOverflow).toBeLessThanOrEqual(1); // allow sub-pixel rounding

			// Infinite scroll still fires: scrolling to the bottom loads more.
			const before = await sidebar.evaluate((el) => el.childElementCount);
			await sidebar.evaluate((el) => el.scrollTo(0, el.scrollHeight));
			await expect
				.poll(() => sidebar.evaluate((el) => el.childElementCount), { timeout: 10_000 })
				.toBeGreaterThan(before);
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('nonexistent asset shows a not-found message', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e assets 404' });

		try {
			await login(page);
			await page.goto(`/case/${caseId}/assets/999999`);
			await expect(page.getByText(/not.?found/i)).toBeVisible();
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

import { test, expect } from '../helpers/fixtures';
import { E2E_USERNAME, login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

// The topbar case switcher (src/lib/components/navigation/TopBar/TopBar.svelte).
// On a `/case/...` route it renders the current case's name, and the backend
// prefixes case names with `#<id> - `, so the id is the stable part to assert on.
const TOPBAR = 'header.min-h-14';

test.describe('Complex flow · case context switch', () => {
	test('current case indicator changes when navigating to a new case', async ({ page }) => {
		// Two full page loads, each waiting for the app to settle, plus the
		// seed/cleanup round trips — the 30s project default is too tight once
		// the waits below are given room to actually be waits. 60s covers the
		// 40s of explicit ceilings below plus login and the seed round trips;
		// it runs in ~5s, so the rest is headroom, not budget. (90s just meant
		// a genuine hang burned an extra half-minute before reporting.)
		test.setTimeout(60_000);

		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'switched to' });

		try {
			await login(page);

			// Go home first to establish a "current case" (Initial Demo or
			// whatever the topbar shows).
			await page.goto('/');
			await expect(page.getByRole('main').first()).toBeVisible();

			// Let the dashboard settle before navigating away. `main` goes
			// visible as soon as the shell renders, while the page is still
			// mid-way through its API burst — including the token refresh that
			// every fresh page load kicks off, because the access token lives
			// in memory only and is gone after a navigation. Tearing that down
			// with a second `goto` aborts the refresh after the backend has
			// already rotated the refresh cookie, so the next load presents a
			// spent token, takes a 401, and `handleSessionExpiration` bounces
			// the browser to /login mid-assertion. That is what made this test
			// fail on both attempts while the near-identical
			// cases/seed-and-open.spec.ts — one navigation, nothing aborted —
			// kept passing.
			//
			// The sidebar user chip reads "Loading..." until `/whoami` comes
			// back, so the username appearing means auth has finished. Asserted
			// on text content rather than visibility because the chip's label
			// sits in a `max-w-0 overflow-hidden` wrapper when the sidebar is
			// collapsed.
			await expect(page.locator('body')).toContainText(E2E_USERNAME, { timeout: 15_000 });
			await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => {
				// Best-effort: the notification socket can keep the connection
				// busy indefinitely. The `whoami` wait above is the assertion
				// that matters.
			});

			// Now open the seeded case — the case-switcher indicator in the
			// topbar should update to reflect this case.
			await page.goto(`/case/${caseId}`);
			await expect(page.locator(TOPBAR).first()).toContainText(new RegExp(`#${caseId}\\b`), {
				timeout: 15_000
			});
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

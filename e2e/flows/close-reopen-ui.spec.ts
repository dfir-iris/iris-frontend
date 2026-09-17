import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';

test.describe('Complex flow · close/reopen via API, verify in UI', () => {
	test('closed case shows a closed state on the detail page', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e close-reopen' });

		try {
			const closeRes = await api.post(`/api/v2/cases/${caseId}/close`, { data: {} });
			expect(closeRes.ok(), await closeRes.text()).toBeTruthy();

			await login(page);
			await page.goto(`/case/${caseId}`);
			// The topbar shows "closed" state chip somewhere in the DOM
			// once the case is closed.
			await expect(page.locator('body')).toContainText(/closed/i, { timeout: 10_000 });

			await api.post(`/api/v2/cases/${caseId}/reopen`, { data: {} });

			// After reopen, the API-side close_date should be null.
			const reopened = await apiJson<{ close_date: string | null }>(
				await api.get(`/api/v2/cases/${caseId}`)
			);
			expect(reopened.close_date).toBeNull();
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	// Closing from the UI writes the state and the note in one PUT, and the
	// note is the half that is easy to get right on its own: an earlier build
	// saved the text and silently left the case open, because the dialog
	// cleared the state that says *why* it was open before handing the note to
	// its confirm handler. Only a browser catches that — the API round-trip
	// passes either way.
	test('closing from the case menu records the note and the closed state', async ({ page }) => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e close-with-note' });
		const note = 'Contained and eradicated — no further action.';

		try {
			await login(page);
			await page.goto(`/case/${caseId}`);

			// `.first()`: the dropdown trigger renders its own button around the
			// one in the topbar, so the `sr-only` name matches both. The outer is
			// the trigger proper.
			await page.getByRole('button', { name: 'Case menu' }).first().click();
			await page.getByRole('menuitem', { name: /^Close Case/ }).click();

			await page.getByPlaceholder(/Why is this case being closed/).fill(note);
			await page.getByRole('button', { name: 'Close case', exact: true }).click();

			// Asserted against the server rather than the topbar chip: the point
			// is what was persisted, and a chip can render from optimistic state
			// that no request ever backed.
			await expect
				.poll(
					async () => {
						const c = await apiJson<{
							closing_note: string | null;
							state: { state_name: string } | null;
						}>(await api.get(`/api/v2/cases/${caseId}`));
						return { note: c.closing_note, state: c.state?.state_name ?? null };
					},
					{ timeout: 15_000 }
				)
				.toEqual({ note, state: 'Closed' });
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

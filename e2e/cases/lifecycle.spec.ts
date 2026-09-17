import { test, expect } from '../helpers/fixtures';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';

test.describe('Cases · lifecycle (API-driven)', () => {
	test('close then reopen sets the expected state', async () => {
		const api = await adminApi();
		const caseId = await seed.case(api);

		try {
			// Close
			const closeRes = await api.post(`/api/v2/cases/${caseId}/close`, { data: {} });
			expect(closeRes.ok(), await closeRes.text()).toBeTruthy();

			// Read back — case_state should reflect the closed state.
			const closedRes = await api.get(`/api/v2/cases/${caseId}`);
			expect(closedRes.ok()).toBeTruthy();
			const closed = await apiJson<{ close_date: string | null; state: { state_name: string } }>(
				closedRes
			);
			expect(closed.close_date, 'close_date should be set after close').not.toBeNull();

			// Reopen
			const reopenRes = await api.post(`/api/v2/cases/${caseId}/reopen`, { data: {} });
			expect(reopenRes.ok(), await reopenRes.text()).toBeTruthy();

			const reopened = await apiJson<{ close_date: string | null }>(
				await api.get(`/api/v2/cases/${caseId}`)
			);
			expect(reopened.close_date, 'close_date should be null after reopen').toBeNull();
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('closing note round-trips through the update PUT and survives reopen', async () => {
		// The UI closes a case by PUTting state_id + closing_note together,
		// not via POST /close (which has no way to carry a note). This is the
		// end-to-end proof that the column the UI writes actually persists.
		const api = await adminApi();
		const caseId = await seed.case(api);

		try {
			const statesRes = await api.get('/api/v2/manage/case-objects/case-states?per_page=10000');
			expect(statesRes.ok(), await statesRes.text()).toBeTruthy();
			const states = await apiJson<{ state_id: number; state_name: string }[]>(statesRes);
			const closedStateId = states.find((s) => s.state_name === 'Closed')?.state_id;
			expect(closedStateId, 'stack should seed a "Closed" case state').toBeDefined();

			const note = 'Confirmed false positive — vendor scanner sweep.';

			const closeRes = await api.put(`/api/v2/cases/${caseId}`, {
				data: { state_id: closedStateId, closing_note: note }
			});
			expect(closeRes.ok(), await closeRes.text()).toBeTruthy();

			const closed = await apiJson<{ close_date: string | null; closing_note: string | null }>(
				await api.get(`/api/v2/cases/${caseId}`)
			);
			expect(closed.closing_note, 'closing_note should persist').toBe(note);
			expect(closed.close_date, 'close_date should be set by the PUT path too').not.toBeNull();

			// Reopening is reversible, so it must not destroy the record of
			// why the case was closed.
			const reopenRes = await api.post(`/api/v2/cases/${caseId}/reopen`, { data: {} });
			expect(reopenRes.ok(), await reopenRes.text()).toBeTruthy();

			const reopened = await apiJson<{ close_date: string | null; closing_note: string | null }>(
				await api.get(`/api/v2/cases/${caseId}`)
			);
			expect(reopened.close_date, 'close_date should be null after reopen').toBeNull();
			expect(reopened.closing_note, 'closing_note should survive a reopen').toBe(note);

			// An emptied note clears the column rather than persisting ''.
			const clearRes = await api.put(`/api/v2/cases/${caseId}`, {
				data: { closing_note: null }
			});
			expect(clearRes.ok(), await clearRes.text()).toBeTruthy();

			const cleared = await apiJson<{ closing_note: string | null }>(
				await api.get(`/api/v2/cases/${caseId}`)
			);
			expect(cleared.closing_note, 'closing_note should be clearable').toBeNull();
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('delete removes the case', async () => {
		const api = await adminApi();
		const caseId = await seed.case(api);

		const del = await api.delete(`/api/v2/cases/${caseId}`);
		expect(del.ok(), await del.text()).toBeTruthy();

		const get = await api.get(`/api/v2/cases/${caseId}`);
		expect(get.status()).toBe(404);

		await api.dispose();
	});
});

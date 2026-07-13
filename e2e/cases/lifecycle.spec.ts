import { test, expect } from '@playwright/test';
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

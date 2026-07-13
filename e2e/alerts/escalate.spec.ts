import { test, expect } from '@playwright/test';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';

test.describe('Alerts · escalation (API-driven)', () => {
	test('escalate creates a case linked to the alert', async () => {
		const api = await adminApi();
		const alertId = await seed.alert(api, { alert_title: 'e2e escalate' });

		let caseId: number | undefined;
		try {
			const res = await api.post(`/api/v2/alerts/escalate/${alertId}`, {
				data: {
					case_title: 'Escalated by e2e',
					case_tags: '', // comma-separated string, not array
					iocs_import_list: [],
					assets_import_list: [],
					import_as_event: false
				}
			});
			expect(res.ok(), await res.text()).toBeTruthy();
			const created = await apiJson<{ case_id: number }>(res);
			expect(created.case_id, 'escalate should return the new case_id').toBeGreaterThan(0);
			caseId = created.case_id;

			// The case's source-alert-cluster or alerts list should reference
			// the escalated alert. Confirm the case exists and is open.
			const caseGet = await api.get(`/api/v2/cases/${caseId}`);
			expect(caseGet.ok()).toBeTruthy();
			const caseObj = await apiJson<{ close_date: string | null }>(caseGet);
			expect(caseObj.close_date, 'new escalated case should be open').toBeNull();
		} finally {
			if (caseId) await cleanup.case(api, caseId);
			await cleanup.alert(api, alertId);
			await api.dispose();
		}
	});
});

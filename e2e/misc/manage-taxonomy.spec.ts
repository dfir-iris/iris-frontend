import { test, expect } from '@playwright/test';
import { adminApi } from '../helpers/api';

// Taxonomy API: read-only list endpoints for severity, TLP, alert statuses,
// task statuses, event categories, etc. These are taxonomy tables —
// the data is seeded at init time; we just assert the endpoints respond.

const TAXONOMY_ENDPOINTS = [
	'/api/v2/manage/severities',
	'/api/v2/manage/tlp',
	'/api/v2/manage/alert-statuses',
	'/api/v2/manage/alert-resolutions',
	'/api/v2/manage/analysis-statuses',
	'/api/v2/manage/event-categories',
	'/api/v2/manage/task-statuses',
	'/api/v2/manage/case-objects/asset-types',
	'/api/v2/manage/case-objects/ioc-types',
	'/api/v2/manage/case-objects/case-classifications',
	'/api/v2/manage/case-objects/case-states',
	'/api/v2/manage/case-objects/evidence-types'
];

test.describe('Manage · taxonomy read endpoints', () => {
	for (const endpoint of TAXONOMY_ENDPOINTS) {
		test(`GET ${endpoint} returns 200`, async () => {
			const api = await adminApi();
			try {
				const res = await api.get(endpoint);
				expect(res.ok(), `${endpoint} → ${res.status()} ${await res.text()}`).toBeTruthy();
			} finally {
				await api.dispose();
			}
		});
	}
});

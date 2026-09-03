import { test, expect } from '../helpers/fixtures';
import { adminApi } from '../helpers/api';

// Manage / custom attributes — list and schema endpoints.
// Mutation (create/update) is schema-heavy and touches case display;
// we keep to safe read operations.

test.describe('Manage · custom attributes API', () => {
	test('list custom attributes returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/custom-attributes');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});

	test('validate endpoint accepts a schema object', async () => {
		const api = await adminApi();
		try {
			const res = await api.post('/api/v2/manage/custom-attributes/validate', {
				data: { attribute_content: {} }
			});
			// Accept 200 (valid) or 400 (invalid schema) — not 500.
			expect(res.status()).toBeLessThan(500);
		} finally {
			await api.dispose();
		}
	});
});

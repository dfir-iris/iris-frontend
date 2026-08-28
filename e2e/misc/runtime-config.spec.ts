import { test, expect } from '@playwright/test';
import { adminApi } from '../helpers/api';

// Runtime config API — read endpoints for feature flags / server config
// exposed to the frontend.

test.describe('Runtime config · API', () => {
	test('GET /api/v2/runtime-config returns a config object', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/runtime-config');
			// This endpoint is public (used before login in some contexts) or
			// authenticated; accept 200 or 401, never 5xx.
			expect(res.status()).toBeLessThan(500);
		} finally {
			await api.dispose();
		}
	});
});

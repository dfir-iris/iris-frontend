import { test, expect } from '../helpers/fixtures';
import { adminApi } from '../helpers/api';

// Profile / me API — context, permissions, followed-cases, api-keys.

test.describe('Profile / me · API', () => {
	test('GET /api/v2/me returns current user profile', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/me');
			expect(res.ok(), await res.text()).toBeTruthy();
			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toBeDefined();
		} finally {
			await api.dispose();
		}
	});

	test('GET /api/v2/me/context returns case context', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/me/context');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});

	test('GET /api/v2/me/followed-cases returns a list', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/me/followed-cases');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});

	test('GET /api/v2/me/api-keys returns a list', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/me/api-keys');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});

	test('POST /api/v2/me/permissions/refresh responds without error', async () => {
		const api = await adminApi();
		try {
			const res = await api.post('/api/v2/me/permissions/refresh', { data: {} });
			expect(res.status()).toBeLessThan(500);
		} finally {
			await api.dispose();
		}
	});
});

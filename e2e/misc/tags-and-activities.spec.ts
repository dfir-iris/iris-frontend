import { test, expect } from '../helpers/fixtures';
import { adminApi } from '../helpers/api';

// Tags and activities API coverage.

test.describe('Tags · API', () => {
	test('list tags returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/tags');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});
});

test.describe('Activities · API', () => {
	test('list activities returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/activities');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});
});

test.describe('Cases filters · API', () => {
	test('list case filter presets returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/cases-filters');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});
});

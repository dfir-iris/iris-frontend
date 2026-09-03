import { test, expect } from '../helpers/fixtures';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';

// The v2 search API (/api/v2/search) requires the search_across_cases
// permission — the default admin account has it.

test.describe('Search API · cross-case', () => {
	test('search with no types returns 400', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/search?value=test');
			// types is required; endpoint returns 400 when absent.
			expect(res.status()).toBe(400);
		} finally {
			await api.dispose();
		}
	});

	test('search notes returns structured results', async () => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e search notes' });
		const noteTitle = `searchable-note-${Math.random().toString(36).slice(2, 8)}`;

		try {
			await seed.note(api, caseId, { note_title: noteTitle, note_content: 'hello from e2e' });

			const res = await api.get(
				`/api/v2/search?value=${encodeURIComponent(noteTitle)}&types=notes`
			);
			expect(res.ok(), await res.text()).toBeTruthy();
			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toBeDefined();
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('search iocs returns structured results', async () => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e search iocs' });
		const iocVal = `ioc.e2e.${Math.random().toString(36).slice(2, 8)}.invalid`;

		try {
			await seed.ioc(api, caseId, { ioc_value: iocVal });

			const res = await api.get(`/api/v2/search?value=${encodeURIComponent(iocVal)}&types=ioc`);
			expect(res.ok(), await res.text()).toBeTruthy();
			const body = await apiJson<unknown>(res);
			expect(body).toBeDefined();
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('unknown search type returns 400', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/search?value=x&types=not_a_type');
			expect(res.status()).toBe(400);
		} finally {
			await api.dispose();
		}
	});
});

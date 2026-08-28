import { test, expect } from '@playwright/test';
import { adminApi, apiJson } from '../helpers/api';

// Manage / case templates CRUD.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('Manage · case templates API', () => {
	test('list case templates returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/case-templates');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});

	test('template schema endpoint returns a schema', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/case-templates/schema');
			expect(res.ok(), await res.text()).toBeTruthy();
			const body = (await res.json()) as Record<string, unknown>;
			expect(body).toBeDefined();
		} finally {
			await api.dispose();
		}
	});

	test('create → get → delete case template', async () => {
		const api = await adminApi();
		let templateId: number | undefined;

		try {
			const create = await api.post('/api/v2/manage/case-templates', {
				data: {
					name: rand('tmpl'),
					description: 'e2e template',
					title_prefix: '[E2E]',
					tags: [],
					tasks: []
				}
			});
			expect(create.ok(), await create.text()).toBeTruthy();
			const body = await apiJson<{ id: number }>(create);
			templateId = body.id;
			expect(templateId).toBeGreaterThan(0);

			const get = await api.get(`/api/v2/manage/case-templates/${templateId}`);
			expect(get.ok(), await get.text()).toBeTruthy();
		} finally {
			if (templateId) {
				await api.delete(`/api/v2/manage/case-templates/${templateId}`).catch(() => {});
			}
			await api.dispose();
		}
	});
});

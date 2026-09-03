import { test, expect } from '../helpers/fixtures';
import { adminApi, discover, apiJson } from '../helpers/api';

// Global (non-case-scoped) tasks and dim-tasks API coverage.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('Global tasks · API', () => {
	test('list global tasks returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/global-tasks');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});

	test('create global task and delete it', async () => {
		const api = await adminApi();
		const ids = await discover(api);
		let taskId: number | undefined;

		try {
			const create = await api.post('/api/v2/global-tasks', {
				data: {
					task_title: rand('global-task'),
					task_assignee_id: ids.currentUserId,
					task_status_id: 1
				}
			});
			expect(create.ok(), await create.text()).toBeTruthy();
			const body = await apiJson<{ task_id: number }>(create);
			taskId = body.task_id;
			expect(taskId).toBeGreaterThan(0);
		} finally {
			if (taskId) {
				await api.delete(`/api/v2/global-tasks/${taskId}`).catch(() => {});
			}
			await api.dispose();
		}
	});
});

test.describe('DIM tasks · API', () => {
	test('list dim-tasks returns a result', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/dim-tasks');
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await api.dispose();
		}
	});
});

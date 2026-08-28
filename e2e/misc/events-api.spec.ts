import { test, expect } from '@playwright/test';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';

// Standalone events API (not case-scoped). Also covers case-scoped event
// CRUD which is used by the timeline but never explicitly tested.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('Case events · API', () => {
	test('create → list → get → delete event', async () => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e events' });

		try {
			const create = await api.post(`/api/v2/cases/${caseId}/events`, {
				data: {
					event_title: rand('event'),
					event_date: '2026-01-01T12:00:00.000',
					event_tz: '+00:00',
					event_category_id: 1,
					event_assets: [],
					event_iocs: [],
					event_content: 'test event body'
				}
			});
			expect(create.ok(), await create.text()).toBeTruthy();
			const event = await apiJson<{ event_id: number }>(create);
			const eventId = event.event_id;
			expect(eventId).toBeGreaterThan(0);

			const list = await api.get(`/api/v2/cases/${caseId}/events`);
			expect(list.ok()).toBeTruthy();

			const get = await api.get(`/api/v2/cases/${caseId}/events/${eventId}`);
			expect(get.ok()).toBeTruthy();

			const del = await api.delete(`/api/v2/cases/${caseId}/events/${eventId}`);
			expect(del.ok(), await del.text()).toBeTruthy();
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('update event title', async () => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e event update' });

		try {
			const create = await api.post(`/api/v2/cases/${caseId}/events`, {
				data: {
					event_title: 'original-title',
					event_date: '2026-01-01T12:00:00.000',
					event_tz: '+00:00',
					event_category_id: 1,
					event_assets: [],
					event_iocs: [],
					event_content: ''
				}
			});
			expect(create.ok(), await create.text()).toBeTruthy();
			const event = await apiJson<{ event_id: number }>(create);

			const upd = await api.put(`/api/v2/cases/${caseId}/events/${event.event_id}`, {
				data: {
					event_title: 'updated-title',
					event_date: '2026-01-01T12:00:00.000',
					event_tz: '+00:00',
					event_category_id: 1,
					event_assets: [],
					event_iocs: []
				}
			});
			expect(upd.ok(), await upd.text()).toBeTruthy();
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});

	test('event comments: post → list → delete', async () => {
		const api = await adminApi();
		const caseId = await seed.case(api, { case_name: 'e2e event comment' });

		try {
			const create = await api.post(`/api/v2/cases/${caseId}/events`, {
				data: {
					event_title: rand('event-with-comment'),
					event_date: '2026-01-01T12:00:00.000',
					event_tz: '+00:00',
					event_category_id: 1,
					event_assets: [],
					event_iocs: [],
					event_content: ''
				}
			});
			expect(create.ok(), await create.text()).toBeTruthy();
			const event = await apiJson<{ event_id: number }>(create);

			const commentBase = `/api/v2/events/${event.event_id}/comments`;
			const post = await api.post(commentBase, { data: { comment_text: 'event note' } });
			expect(post.ok(), await post.text()).toBeTruthy();
			const comment = await apiJson<{ comment_id: number }>(post);

			const list = await api.get(commentBase);
			expect(list.ok()).toBeTruthy();
			expect(await list.text()).toContain('event note');

			await api.delete(`${commentBase}/${comment.comment_id}`);
		} finally {
			await cleanup.case(api, caseId);
			await api.dispose();
		}
	});
});

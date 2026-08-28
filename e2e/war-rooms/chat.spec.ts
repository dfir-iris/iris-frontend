import { test, expect } from '@playwright/test';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';

// War-room chat message lifecycle via the v2 REST API.
// The WebSocket channel is not tested here — only the REST endpoints
// that back bulk fetch / deletion / threading.

const chatBase = (warRoomId: number) => `/api/v2/war-rooms/${warRoomId}/chat`;

test.describe('War room · chat messages (API)', () => {
	test('post a message and retrieve it', async () => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);

		try {
			const postRes = await api.post(chatBase(wrId), {
				data: { kind: 'message', body: 'hello e2e' }
			});
			expect(postRes.ok(), await postRes.text()).toBeTruthy();
			const msg = await apiJson<{ message_id: number; body: string }>(postRes);
			expect(msg.message_id).toBeGreaterThan(0);
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});

	test('list messages includes posted message', async () => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);

		try {
			const body = 'listed-e2e-msg';
			await api.post(chatBase(wrId), { data: { kind: 'message', body } });

			const listRes = await api.get(chatBase(wrId));
			expect(listRes.ok(), await listRes.text()).toBeTruthy();
			const text = await listRes.text();
			expect(text).toContain(body);
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});

	test('missing body returns 400', async () => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);

		try {
			const res = await api.post(chatBase(wrId), {
				data: {}
			});
			expect(res.status()).toBe(400);
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});

	test('second message is also posted successfully', async () => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);

		try {
			const res = await api.post(chatBase(wrId), {
				data: { body: 'second message e2e' }
			});
			expect(res.ok(), await res.text()).toBeTruthy();
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});
});

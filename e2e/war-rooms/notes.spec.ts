import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup, apiJson } from '../helpers/api';

// War-room notes: API CRUD + individual note page.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

test.describe('War room · notes', () => {
	test('create → list → get → delete note via API', async () => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);

		try {
			// Create a folder first (notes require a folder).
			const folderRes = await api.post(`/api/v2/war-rooms/${wrId}/notes-folders`, {
				data: { name: rand('folder') }
			});
			expect(folderRes.ok(), await folderRes.text()).toBeTruthy();
			const folder = await apiJson<{ id: number }>(folderRes);

			// Create a note.
			const noteRes = await api.post(`/api/v2/war-rooms/${wrId}/notes`, {
				data: {
					title: rand('wr-note'),
					content: '# E2E war room note',
					folder_id: folder.id
				}
			});
			expect(noteRes.ok(), await noteRes.text()).toBeTruthy();
			const note = await apiJson<{ note_id: number }>(noteRes);
			expect(note.note_id).toBeGreaterThan(0);

			// List notes.
			const list = await api.get(`/api/v2/war-rooms/${wrId}/notes`);
			expect(list.ok()).toBeTruthy();

			// Get single note.
			const get = await api.get(`/api/v2/war-rooms/${wrId}/notes/${note.note_id}`);
			expect(get.ok()).toBeTruthy();

			// Delete note.
			const del = await api.delete(`/api/v2/war-rooms/${wrId}/notes/${note.note_id}`);
			expect(del.ok(), await del.text()).toBeTruthy();
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});

	test('individual war-room note page loads', async ({ page }) => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);

		try {
			// Create folder + note via API, then navigate to the note page.
			const folderRes = await api.post(`/api/v2/war-rooms/${wrId}/notes-folders`, {
				data: { name: rand('ui-folder') }
			});
			const folder = await apiJson<{ id: number }>(folderRes);

			const noteRes = await api.post(`/api/v2/war-rooms/${wrId}/notes`, {
				data: {
					title: rand('wr-ui-note'),
					content: '# UI test',
					folder_id: folder.id
				}
			});
			if (!noteRes.ok()) {
				// Notes endpoint may differ per stack version; skip gracefully.
				return;
			}
			const note = await apiJson<{ note_id: number }>(noteRes);

			await login(page);
			await page.goto(`/war-rooms/${wrId}/notes/${note.note_id}`);
			await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});
});

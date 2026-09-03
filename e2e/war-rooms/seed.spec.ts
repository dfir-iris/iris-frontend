import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, seed, cleanup } from '../helpers/api';

test.describe('War rooms · seed via API', () => {
	test('seeded war-room is reachable at /war-rooms/<id>', async ({ page }) => {
		const api = await adminApi();
		const name = `wr ${Math.random().toString(36).slice(2, 8)}`;
		const wrId = await seed.warRoom(api, { name });

		try {
			await login(page);
			await page.goto(`/war-rooms/${wrId}`);
			await expect(page).toHaveURL(new RegExp(`/war-rooms/${wrId}`));
			await expect(page.getByRole('main')).toBeVisible();
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});

	test('war-room chat page loads for a seeded room', async ({ page }) => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);

		try {
			await login(page);
			await page.goto(`/war-rooms/${wrId}/chat`);
			await expect(page).toHaveURL(new RegExp(`/war-rooms/${wrId}/chat`));
			await expect(page.getByRole('main')).toBeVisible();
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});

	test('war-room tasks page loads for a seeded room', async ({ page }) => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);

		try {
			await login(page);
			await page.goto(`/war-rooms/${wrId}/tasks`);
			await expect(page).toHaveURL(new RegExp(`/war-rooms/${wrId}/tasks`));
			await expect(page.getByRole('main')).toBeVisible();
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});

	test('war-room summary/notes/timelines/sitreps subroutes load', async ({ page }) => {
		const api = await adminApi();
		const wrId = await seed.warRoom(api);

		try {
			await login(page);
			for (const sub of ['/summary', '/notes', '/timelines', '/sitreps', '/members', '/teams']) {
				await page.goto(`/war-rooms/${wrId}${sub}`);
				await expect(page).toHaveURL(new RegExp(`/war-rooms/${wrId}${sub}`));
				await expect(page.getByRole('main')).toBeVisible();
			}
		} finally {
			await cleanup.warRoom(api, wrId);
			await api.dispose();
		}
	});
});

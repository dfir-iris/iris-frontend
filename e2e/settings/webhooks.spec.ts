import { test, expect } from '../helpers/fixtures';
import { login } from '../helpers/auth';
import { adminApi, apiJson } from '../helpers/api';

// Settings · webhooks: API contract (secrets are write-only) and the editor.

const rand = (p: string) => `${p}-${Math.random().toString(36).slice(2, 8)}`;

interface WebhookEntry {
	name: string;
	value: string | null;
	secret: boolean;
	has_value?: boolean;
}

interface Webhook {
	id: number;
	name: string;
	verify_tls: boolean;
	headers: WebhookEntry[];
	has_auth_secret: boolean;
}

test.describe('Settings · webhooks API', () => {
	test('event catalogue is not empty', async () => {
		const api = await adminApi();
		try {
			const res = await api.get('/api/v2/manage/webhooks/events');
			expect(res.ok(), await res.text()).toBeTruthy();
			const events = await apiJson<{ name: string }[]>(res);
			expect(events.length).toBeGreaterThan(0);
		} finally {
			await api.dispose();
		}
	});

	test('create → secrets hidden → kept on update → delete', async () => {
		const api = await adminApi();
		let id: number | undefined;
		try {
			const create = await api.post('/api/v2/manage/webhooks', {
				data: {
					name: rand('E2E webhook'),
					enabled: false,
					events: ['case_created'],
					url: 'https://example.com/iris-e2e',
					headers: [
						{ name: 'X-Plain', value: 'visible', secret: false },
						{ name: 'X-Token', value: 'hunter2', secret: true }
					],
					auth_type: 'bearer',
					auth_secret: 'bearer-secret',
					verify_tls: false
				}
			});
			expect(create.status(), await create.text()).toBe(201);
			const created = await apiJson<Webhook>(create);
			id = created.id;
			expect(created.verify_tls).toBe(false);
			expect(created.has_auth_secret).toBe(true);
			const token = created.headers.find((h) => h.name === 'X-Token');
			expect(token).toMatchObject({ value: null, secret: true, has_value: true });
			expect(JSON.stringify(created)).not.toContain('hunter2');
			expect(JSON.stringify(created)).not.toContain('bearer-secret');

			// A secret sent back as null keeps the stored value.
			const update = await api.put(`/api/v2/manage/webhooks/${id}`, {
				data: {
					headers: [
						{ name: 'X-Plain', value: 'changed', secret: false },
						{ name: 'X-Token', value: null, secret: true }
					]
				}
			});
			expect(update.ok(), await update.text()).toBeTruthy();
			const updated = await apiJson<Webhook>(update);
			expect(updated.headers.find((h) => h.name === 'X-Token')?.has_value).toBe(true);
			expect(updated.headers.find((h) => h.name === 'X-Plain')?.value).toBe('changed');

			const preview = await api.post('/api/v2/manage/webhooks/preview', {
				data: { webhook: {}, webhook_id: id, event: 'case_created' }
			});
			expect(preview.ok(), await preview.text()).toBeTruthy();
			expect(await preview.text()).not.toContain('hunter2');
		} finally {
			if (id) await api.delete(`/api/v2/manage/webhooks/${id}`).catch(() => {});
			await api.dispose();
		}
	});

	test('rejects an invalid URL with a field error', async () => {
		const api = await adminApi();
		try {
			const res = await api.post('/api/v2/manage/webhooks', {
				data: { name: rand('E2E bad'), events: ['*'], url: 'not a url' }
			});
			expect(res.status()).toBe(400);
			const body = (await res.json()) as { data?: Record<string, string[]> };
			expect(body.data).toHaveProperty('url');
		} finally {
			await api.dispose();
		}
	});
});

test.describe('Settings · webhooks UI', () => {
	test.beforeEach(async ({ page }) => {
		await login(page);
	});

	test('create a webhook from the editor', async ({ page }) => {
		const name = rand('E2E UI webhook');
		let id: number | undefined;
		try {
			await page.goto('/settings/webhooks');
			await page.getByTestId('webhook-new').click();
			await expect(page.getByTestId('webhook-editor')).toBeVisible();

			await page.locator('#webhook-name').fill(name);

			await page.getByRole('tab', { name: /Events/ }).click();
			await page.getByText('All events', { exact: true }).click();

			await page.getByRole('tab', { name: /Request/ }).click();
			await page.getByTestId('webhook-url').fill('https://example.com/iris-e2e-ui');
			await page.getByRole('switch', { name: 'Verify TLS certificate' }).click();
			await expect(page.getByTestId('webhook-tls-warning')).toBeVisible();

			await page.getByTestId('webhook-save').click();
			await expect(page).toHaveURL(/[?&]webhook=\d+/, { timeout: 10_000 });
			id = Number(new URL(page.url()).searchParams.get('webhook'));

			// Saved: the deliveries tab unlocks.
			await expect(page.getByRole('tab', { name: 'Deliveries' })).toBeEnabled();

			await page.goto('/settings/webhooks');
			await expect(page.getByTestId('webhook-table')).toContainText(name);
		} finally {
			if (id) {
				const api = await adminApi();
				await api.delete(`/api/v2/manage/webhooks/${id}`).catch(() => {});
				await api.dispose();
			}
		}
	});

	test('validation errors land on the right tab', async ({ page }) => {
		await page.goto('/settings/webhooks');
		await page.getByTestId('webhook-new').click();
		await page.locator('#webhook-name').fill(rand('E2E invalid'));
		await page.getByRole('tab', { name: /Request/ }).click();
		await page.getByTestId('webhook-url').fill('not a url');
		await page.getByTestId('webhook-save').click();
		// No events and a bad URL: both tabs get an error badge.
		await expect(page.getByRole('tab', { name: /Request\s*\d/ })).toBeVisible({ timeout: 10_000 });
		await expect(page).not.toHaveURL(/[?&]webhook=\d+/);
	});
});

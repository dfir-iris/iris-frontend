import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { WebhooksService } from '../webhooks.service';
import { ApiService } from '../api.service';

const mockGet = ApiService.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = ApiService.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = ApiService.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = ApiService.delete as unknown as ReturnType<typeof vi.fn>;
const mockWithQuery = ApiService.withQuery as unknown as ReturnType<typeof vi.fn>;

describe('WebhooksService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGet.mockResolvedValue({ ok: true, data: null });
		mockPost.mockResolvedValue({ ok: true, data: null });
		mockPut.mockResolvedValue({ ok: true, data: null });
		mockDelete.mockResolvedValue({ ok: true, data: null });
		mockWithQuery.mockImplementation(
			(path: string, params: Record<string, unknown>) =>
				`${path}?${new URLSearchParams(params as Record<string, string>)}`
		);
	});

	it('lists, gets and deletes', async () => {
		await WebhooksService.list();
		expect(mockGet).toHaveBeenCalledWith('/manage/webhooks', {});
		await WebhooksService.get(3);
		expect(mockGet).toHaveBeenCalledWith('/manage/webhooks/3', {});
		await WebhooksService.remove(3);
		expect(mockDelete).toHaveBeenCalledWith('/manage/webhooks/3', {});
	});

	it('creates and updates', async () => {
		const body = { name: 'x', url: 'https://example.com' };
		await WebhooksService.create(body);
		expect(mockPost).toHaveBeenCalledWith('/manage/webhooks', body, {});
		await WebhooksService.update(4, { enabled: false });
		expect(mockPut).toHaveBeenCalledWith('/manage/webhooks/4', { enabled: false }, {});
	});

	it('reads the catalogue and settings', async () => {
		await WebhooksService.events();
		expect(mockGet).toHaveBeenCalledWith('/manage/webhooks/events', {});
		await WebhooksService.settings();
		expect(mockGet).toHaveBeenCalledWith('/manage/webhooks/settings', {});
	});

	it('previews and tests', async () => {
		const body = { webhook: { url: 'https://example.com' }, webhook_id: 2, event: 'case_created' };
		await WebhooksService.preview(body);
		expect(mockPost).toHaveBeenCalledWith('/manage/webhooks/preview', body, {});
		await WebhooksService.test(body);
		expect(mockPost).toHaveBeenCalledWith('/manage/webhooks/test', body, {});
	});

	it('pages deliveries with default size', async () => {
		await WebhooksService.deliveries(5);
		expect(mockWithQuery).toHaveBeenCalledWith('/manage/webhooks/5/deliveries', {
			page: 1,
			per_page: 25
		});
		expect(mockGet).toHaveBeenCalledWith('/manage/webhooks/5/deliveries?page=1&per_page=25', {});
	});

	it('filters deliveries', async () => {
		await WebhooksService.deliveries(5, { page: 2, status: 'failed', event: 'case_created' });
		expect(mockWithQuery).toHaveBeenCalledWith('/manage/webhooks/5/deliveries', {
			page: 2,
			per_page: 25,
			status: 'failed',
			event: 'case_created'
		});
	});

	it('reads and redelivers a delivery', async () => {
		await WebhooksService.delivery(9);
		expect(mockGet).toHaveBeenCalledWith('/manage/webhooks/deliveries/9', {});
		await WebhooksService.redeliver(9);
		expect(mockPost).toHaveBeenCalledWith('/manage/webhooks/deliveries/9/redeliver', {}, {});
	});

	it('checks and imports the legacy module', async () => {
		await WebhooksService.legacyStatus();
		expect(mockGet).toHaveBeenCalledWith('/manage/webhooks/legacy-module', {});
		await WebhooksService.legacyImport();
		expect(mockPost).toHaveBeenCalledWith('/manage/webhooks/legacy-module/import', {}, {});
	});
});

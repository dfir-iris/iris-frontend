/**
 * Smoke tests for the v2 Notifications service.
 *
 * Covers the URL + body shape for the feed, mark-read, and per-user
 * settings endpoints, plus the admin defaults endpoints so we catch
 * a rename on either side.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn((url: string, params: Record<string, unknown>) => {
			const qs = new URLSearchParams();
			for (const [k, v] of Object.entries(params)) {
				if (v == null) continue;
				qs.append(k, String(v));
			}
			const q = qs.toString();
			return q ? `${url}?${q}` : url;
		}),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { NotificationsService } from '../notifications.service';
import { ApiService } from '../api.service';

describe('NotificationsService — feed', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('list() calls /api/v2/notifications with query params', async () => {
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { data: [], unread_count: 0 }
		});

		await NotificationsService.list({ unread_only: true, limit: 20 });

		expect(ApiService.get).toHaveBeenCalledWith(
			'/api/v2/notifications?unread_only=true&limit=20',
			{}
		);
	});

	it('unreadCount() hits the dedicated endpoint', async () => {
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { unread_count: 3 }
		});

		const res = await NotificationsService.unreadCount();
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/notifications/unread-count', {});
		expect(res.data).toEqual({ unread_count: 3 });
	});

	it('markRead({ids}) posts the ids array', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { affected: 2, unread_count: 0 }
		});

		await NotificationsService.markRead({ ids: [1, 2] });

		expect(ApiService.post).toHaveBeenCalledWith(
			'/api/v2/notifications/mark-read',
			{ ids: [1, 2] },
			{}
		);
	});

	it('markRead({all: true}) posts the all flag', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { affected: 5, unread_count: 0 }
		});

		await NotificationsService.markRead({ all: true });

		expect(ApiService.post).toHaveBeenCalledWith(
			'/api/v2/notifications/mark-read',
			{ all: true },
			{}
		);
	});

	it('clear({ids}) posts to the clear endpoint', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { affected: 2, unread_count: 0 }
		});

		await NotificationsService.clear({ ids: [3, 4] });

		expect(ApiService.post).toHaveBeenCalledWith(
			'/api/v2/notifications/clear',
			{ ids: [3, 4] },
			{}
		);
	});

	it('clear({all: true}) posts the all flag to clear', async () => {
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { affected: 10, unread_count: 0 }
		});

		await NotificationsService.clear({ all: true });

		expect(ApiService.post).toHaveBeenCalledWith(
			'/api/v2/notifications/clear',
			{ all: true },
			{}
		);
	});
});

describe('NotificationsService — settings', () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(() => vi.restoreAllMocks());

	it('getSettings() hits /api/v2/notifications/settings', async () => {
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { event_types: [], channels: [], settings: {} }
		});

		await NotificationsService.getSettings();
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/notifications/settings', {});
	});

	it('putSettings() PUTs the wrapped settings body', async () => {
		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { event_types: [], channels: [], settings: {} }
		});

		await NotificationsService.putSettings({
			mention: { in_app: false, email: false }
		});

		expect(ApiService.put).toHaveBeenCalledWith(
			'/api/v2/notifications/settings',
			{ settings: { mention: { in_app: false, email: false } } },
			{}
		);
	});

	it('getAdminSettings() hits the admin path', async () => {
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { event_types: [], channels: [], settings: {} }
		});

		await NotificationsService.getAdminSettings();
		expect(ApiService.get).toHaveBeenCalledWith(
			'/api/v2/manage/notification-settings',
			{}
		);
	});

	it('putAdminSettings() PUTs to the admin path', async () => {
		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { event_types: [], channels: [], settings: {} }
		});

		await NotificationsService.putAdminSettings({
			task_assigned: { in_app: true, email: true }
		});

		expect(ApiService.put).toHaveBeenCalledWith(
			'/api/v2/manage/notification-settings',
			{ settings: { task_assigned: { in_app: true, email: true } } },
			{}
		);
	});
});

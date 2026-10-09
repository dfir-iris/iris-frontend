/**
 * Store tests for the notifications bell.
 *
 * The store is stateful (holds a rolling list + unread count) and
 * bridges REST + SocketIO. These tests focus on the pure-state
 * transitions: refresh(), receive(), markRead(), markAllRead() — the
 * socket bridge is mocked so we don't need a live server.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: true, dev: false }));
vi.mock('$env/dynamic/public', () => ({ env: { PUBLIC_EXTERNAL_API_URL: '' } }));

// Silence the real socket — we don't need it for these tests. `io()`
// returns a fake with the .on / .emit / .disconnect surface we call.
vi.mock('socket.io-client', () => ({
	io: vi.fn(() => ({
		on: vi.fn(),
		emit: vi.fn(),
		disconnect: vi.fn()
	}))
}));

vi.mock('../auth.store', () => ({
	auth: {
		getAccessToken: vi.fn(() => 'fake-token')
	}
}));

vi.mock('$lib/services/notifications.service', () => ({
	NotificationsService: {
		list: vi.fn(),
		markRead: vi.fn(),
		clear: vi.fn()
	}
}));

import { notifications } from '../notifications.store';
import { NotificationsService } from '$lib/services/notifications.service';
import { io } from 'socket.io-client';

const makeNotif = (id: number, read = false) => ({
	id,
	event_type: 'mention',
	title: `n-${id}`,
	body: null,
	link: null,
	source_type: null,
	source_id: null,
	read_at: read ? new Date().toISOString() : null,
	created_at: new Date().toISOString()
});

describe('notifications store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		notifications.reset();
	});

	it('refresh() populates items + unread count on success', async () => {
		(NotificationsService.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { data: [makeNotif(1), makeNotif(2)], unread_count: 2 }
		});

		await notifications.refresh();

		const state = get(notifications);
		expect(state.items).toHaveLength(2);
		expect(state.unreadCount).toBe(2);
		expect(state.error).toBeNull();
	});

	it('refresh() sets error on failure', async () => {
		(NotificationsService.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 500,
			data: null,
			error: { message: 'boom', type: 'server', status: 500 }
		});

		await notifications.refresh();
		const state = get(notifications);
		expect(state.error).toBe('boom');
		expect(state.items).toHaveLength(0);
	});

	it('receive() prepends and bumps unread count', () => {
		notifications.receive(makeNotif(10));
		notifications.receive(makeNotif(11));

		const state = get(notifications);
		expect(state.items.map((it) => it.id)).toEqual([11, 10]);
		expect(state.unreadCount).toBe(2);
	});

	it('receive() dedupes by id (idempotent socket push vs REST fetch race)', () => {
		notifications.receive(makeNotif(1));
		notifications.receive(makeNotif(1));

		const state = get(notifications);
		expect(state.items).toHaveLength(1);
		expect(state.unreadCount).toBe(1);
	});

	it('markRead(ids) flips read_at and updates unread count', async () => {
		// Seed some items via receive()
		notifications.receive(makeNotif(1));
		notifications.receive(makeNotif(2));

		(NotificationsService.markRead as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { affected: 1, unread_count: 1 }
		});

		await notifications.markRead([1]);

		const state = get(notifications);
		const item1 = state.items.find((it) => it.id === 1)!;
		const item2 = state.items.find((it) => it.id === 2)!;
		expect(item1.read_at).not.toBeNull();
		expect(item2.read_at).toBeNull();
		expect(state.unreadCount).toBe(1);
	});

	it('markAllRead() flips every unread row', async () => {
		notifications.receive(makeNotif(1));
		notifications.receive(makeNotif(2));

		(NotificationsService.markRead as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { affected: 2, unread_count: 0 }
		});

		await notifications.markAllRead();

		const state = get(notifications);
		expect(state.items.every((it) => it.read_at != null)).toBe(true);
		expect(state.unreadCount).toBe(0);
	});

	it('clear(ids) removes the matching rows from the list', async () => {
		notifications.receive(makeNotif(1));
		notifications.receive(makeNotif(2));
		notifications.receive(makeNotif(3));

		(NotificationsService.clear as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { affected: 1, unread_count: 2 }
		});

		await notifications.clear([2]);

		const state = get(notifications);
		expect(state.items.map((it) => it.id).sort()).toEqual([1, 3]);
		expect(state.unreadCount).toBe(2);
	});

	it('clearAll() empties the list', async () => {
		notifications.receive(makeNotif(1));
		notifications.receive(makeNotif(2));

		(NotificationsService.clear as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { affected: 2, unread_count: 0 }
		});

		await notifications.clearAll();

		const state = get(notifications);
		expect(state.items).toHaveLength(0);
		expect(state.unreadCount).toBe(0);
	});

	it('onSocketEvent() binds extra listeners on the shared socket', async () => {
		const handler = vi.fn();
		const off = notifications.onSocketEvent('ai_suggestion', handler);
		(NotificationsService.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { data: [], unread_count: 0 }
		});

		await notifications.initialize();

		const ioMock = io as unknown as ReturnType<typeof vi.fn>;
		const socket = ioMock.mock.results[ioMock.mock.results.length - 1].value as {
			on: ReturnType<typeof vi.fn>;
		};
		const call = socket.on.mock.calls.find(([event]) => event === 'ai_suggestion');
		expect(call).toBeDefined();
		call![1]({ action: 'created' });
		expect(handler).toHaveBeenCalledWith({ action: 'created' });
		off();
		notifications.reset();
	});

	it('watchRoom() joins on every connect and leaves once on unsubscribe', async () => {
		const off = notifications.watchRoom('room_watch', 'room_unwatch', { run_uuid: 'r1' });
		(NotificationsService.list as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { data: [], unread_count: 0 }
		});

		await notifications.initialize();

		const ioMock = io as unknown as ReturnType<typeof vi.fn>;
		const socket = ioMock.mock.results[ioMock.mock.results.length - 1].value as {
			on: ReturnType<typeof vi.fn>;
			emit: ReturnType<typeof vi.fn>;
			connected?: boolean;
		};
		const onConnect = socket.on.mock.calls.find(([event]) => event === 'connect')![1];
		onConnect();
		onConnect();
		const joins = socket.emit.mock.calls.filter(([event]) => event === 'room_watch');
		expect(joins).toEqual([
			['room_watch', { run_uuid: 'r1' }],
			['room_watch', { run_uuid: 'r1' }]
		]);

		socket.connected = true;
		off();
		off();
		const leaves = socket.emit.mock.calls.filter(([event]) => event === 'room_unwatch');
		expect(leaves).toEqual([['room_unwatch', { run_uuid: 'r1' }]]);
		onConnect();
		expect(socket.emit.mock.calls.filter(([event]) => event === 'room_watch')).toHaveLength(2);
		notifications.reset();
	});
});

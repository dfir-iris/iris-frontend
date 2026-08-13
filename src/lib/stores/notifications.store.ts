// Notification store — bell UX state, backed by REST + SocketIO.
//
// The store holds a rolling list of recent notifications and an
// unread count. On mount, `initialize()` opens the `/notifications`
// socket namespace and joins the user's own room; server-side pushes
// (event `new_notification`) call `receive()` to prepend + bump the
// count. `refresh()` re-fetches from REST on demand — used after
// login, on tab-visibility restore, and when the bell dropdown opens.

import { writable, get } from 'svelte/store';
import { io, type Socket } from 'socket.io-client';
import { socketOrigin } from '$lib/config/api.config';
import { auth } from './auth.store';
import { NotificationsService, type Notification } from '../services/notifications.service';

const RECENT_LIMIT = 50;

// Fallback polling cadence. Even with WebSocket + auto-join we can
// still miss a push (proxy blip, backgrounded tab, service-worker
// throttling). Polling the unread-count endpoint every N seconds
// bounds the worst-case staleness of the bell badge. `count(*)` on
// a small indexed table is cheap; if this ever shows up in load
// tests we can back off when the tab is hidden.
const UNREAD_POLL_INTERVAL_MS = 30_000;

export interface NotificationsState {
	items: Notification[];
	unreadCount: number;
	loading: boolean;
	// Set to a message string when the socket is disconnected or the
	// initial fetch failed — the bell renders a subtle warning icon.
	// Null in the happy path.
	error: string | null;
}

const initialState: NotificationsState = {
	items: [],
	unreadCount: 0,
	loading: false,
	error: null,
};

function createNotificationsStore() {
	const { subscribe, update, set } = writable<NotificationsState>(initialState);
	let socket: Socket | null = null;
	let initialised = false;
	let unreadPollTimer: ReturnType<typeof setInterval> | null = null;

	async function refresh() {
		update((s) => ({ ...s, loading: true, error: null }));
		const res = await NotificationsService.list({ limit: RECENT_LIMIT });
		if (!res.ok || res.data === null || typeof res.data === 'string') {
			update((s) => ({
				...s,
				loading: false,
				error: res.error?.message ?? 'Failed to load notifications',
			}));
			return;
		}
		const payload = res.data;
		update((s) => ({
			...s,
			items: payload.data,
			unreadCount: payload.unread_count,
			loading: false,
			error: null,
		}));
	}

	function receive(n: Notification) {
		update((s) => {
			// Dedupe on id — the socket push might race the REST fetch
			// on a fresh mount so we can't blindly prepend.
			if (s.items.some((it) => it.id === n.id)) return s;
			const items = [n, ...s.items].slice(0, RECENT_LIMIT);
			// A pushed notification is by definition unread (server only
			// emits on insert, before any read).
			return { ...s, items, unreadCount: s.unreadCount + 1 };
		});
	}

	async function markRead(ids: number[]) {
		if (!ids.length) return;
		const res = await NotificationsService.markRead({ ids });
		if (!res.ok || res.data === null || typeof res.data === 'string') return;
		// Alias to a local const so TS narrows past the closure boundary
		// — inside `update(...)` the compiler can't re-narrow `res.data`.
		const payload = res.data;
		const now = new Date().toISOString();
		update((s) => ({
			...s,
			items: s.items.map((it) =>
				ids.includes(it.id) && it.read_at == null ? { ...it, read_at: now } : it
			),
			unreadCount: payload.unread_count,
		}));
	}

	async function markAllRead() {
		const res = await NotificationsService.markRead({ all: true });
		if (!res.ok || res.data === null || typeof res.data === 'string') return;
		const payload = res.data;
		const now = new Date().toISOString();
		update((s) => ({
			...s,
			items: s.items.map((it) =>
				it.read_at == null ? { ...it, read_at: now } : it
			),
			unreadCount: payload.unread_count,
		}));
	}

	async function clear(ids: number[]) {
		if (!ids.length) return;
		const res = await NotificationsService.clear({ ids });
		if (!res.ok || res.data === null || typeof res.data === 'string') return;
		const payload = res.data;
		update((s) => ({
			...s,
			items: s.items.filter((it) => !ids.includes(it.id)),
			unreadCount: payload.unread_count,
		}));
	}

	async function clearAll() {
		const res = await NotificationsService.clear({ all: true });
		if (!res.ok || res.data === null || typeof res.data === 'string') return;
		const payload = res.data;
		update((s) => ({
			...s,
			items: [],
			unreadCount: payload.unread_count,
		}));
	}

	function connectSocket() {
		if (socket) return;
		const token = auth.getAccessToken();
		// The origin serving this page, so the socket follows the
		// hostname the user is actually on when a deployment answers
		// under several of them. See `socketOrigin`.
		const baseUrl = socketOrigin();

		socket = io(`${baseUrl}/notifications`, {
			// `auth` is delivered in socket.io's handshake payload —
			// works on WS transport, which strips custom headers by
			// browser policy. `extraHeaders` stays as a belt-and-braces
			// for polling-only proxies. See `on_connect` in
			// `notification_event_handlers.py` for the server side.
			auth: token ? { token } : {},
			extraHeaders: token ? { Authorization: `Bearer ${token}` } : {},
			// `websocket` FIRST, `polling` fallback. Long-polling adds
			// significant push latency (server buffers events until the
			// next poll cycle) and the polling→websocket upgrade dance
			// itself takes multiple round trips. Almost every deployment
			// can hold a WebSocket, so we start there and only fall back
			// if the proxy in front of us really blocks it.
			transports: ['websocket', 'polling'],
			// Don't queue reconnect attempts forever — the SPA will
			// call refresh() next time the user opens the dropdown so
			// missing a socket push is recoverable.
			reconnectionAttempts: 5,
		});

		socket.on('connect', () => {
			socket?.emit('join');
			update((s) => ({ ...s, error: null }));
		});

		socket.on('new_notification', (n: Notification) => {
			receive(n);
		});

		socket.on('connect_error', (err) => {
			update((s) => ({ ...s, error: err?.message ?? 'socket error' }));
		});

		socket.on('disconnect', () => {
			// Not a hard error — brief drops happen. We surface it only
			// if we can't reconnect within the attempt cap.
		});
	}

	function disconnectSocket() {
		try {
			socket?.emit('leave');
			socket?.disconnect();
		} finally {
			socket = null;
		}
	}

	async function pollUnread() {
		// Belt-and-braces safety net for the SocketIO push path.
		// Reads unread_count (cheap `count(*)`); if it disagrees with
		// our local view the socket missed something — pull the recent
		// rows to reconcile.
		const res = await NotificationsService.unreadCount();
		if (!res.ok || res.data == null || typeof res.data === 'string') return;
		const serverCount = res.data.unread_count;
		let localCount = 0;
		update((s) => {
			localCount = s.unreadCount;
			return s;
		});
		if (serverCount !== localCount) {
			await refresh();
		}
	}

	function startPolling() {
		if (unreadPollTimer) return;
		unreadPollTimer = setInterval(() => {
			// `void`: intentional fire-and-forget; errors update the
			// state via the store's own error field.
			void pollUnread();
		}, UNREAD_POLL_INTERVAL_MS);
	}

	function stopPolling() {
		if (unreadPollTimer) {
			clearInterval(unreadPollTimer);
			unreadPollTimer = null;
		}
	}

	async function initialize() {
		if (initialised) return;
		initialised = true;
		await refresh();
		connectSocket();
		startPolling();
	}

	function reset() {
		disconnectSocket();
		stopPolling();
		initialised = false;
		set(initialState);
	}

	return {
		subscribe,
		initialize,
		refresh,
		receive,
		markRead,
		markAllRead,
		clear,
		clearAll,
		reset,
		// Test-only escape hatch. Exposed publicly since Svelte stores
		// have no other convention for this; do not depend on it from
		// production code.
		_getSnapshot: () => get({ subscribe }),
	};
}

export const notifications = createNotificationsStore();

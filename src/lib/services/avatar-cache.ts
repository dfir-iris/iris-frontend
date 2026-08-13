/**
 * Per-process avatar blob cache.
 *
 * The avatar bytes live behind a bearer-token-protected endpoint, so
 * a plain `<img src=…>` would go out without an Authorization header
 * and 401. Instead we `fetch` the bytes with the session token, wrap
 * them in a `URL.createObjectURL`, and hand that object URL to the
 * `<img>`. Each unique `(userId, version)` pair is fetched once and
 * cached; revoking the URL when the entry rotates keeps the browser
 * blob store from leaking.
 *
 * The store is Svelte-reactive — components subscribe via
 * `avatarStore.subscribe` (Svelte's `$avatarStore` auto-subscription
 * works too) and re-render the moment the bytes arrive.
 */
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';
import { auth } from '$lib/stores/auth.store';
import { apiOrigin } from '$lib/config/api.config';

type CacheEntry = {
	status: 'loading' | 'ready' | 'missing' | 'error';
	objectUrl?: string;
	/** Cache-bust seed seen when this entry was written. */
	version?: string | null;
};

type CacheMap = Record<string, CacheEntry>;

const cache = writable<CacheMap>({});

const inflight = new Map<string, Promise<void>>();

const apiBaseUrl = (): string => apiOrigin();

const keyOf = (userId: number, version: string | null | undefined): string =>
	`${userId}::${version ?? ''}`;

function disposeEntry(entry: CacheEntry | undefined): void {
	if (!entry?.objectUrl) return;
	try {
		URL.revokeObjectURL(entry.objectUrl);
	} catch {
		// Object URL already revoked or never created — safe to ignore.
	}
}

async function fetchAvatar(userId: number, version: string | null | undefined): Promise<void> {
	const key = keyOf(userId, version);
	const url = `${apiBaseUrl()}/api/v2/users/${userId}/avatar${version ? `?v=${encodeURIComponent(version)}` : ''}`;

	const token = auth.getAccessToken();
	const headers: Record<string, string> = {};
	if (token) headers.Authorization = `Bearer ${token}`;

	try {
		// Auth is carried by the bearer header above; sending
		// `credentials: 'include'` here would trip CORS because the
		// backend never echoes `Access-Control-Allow-Credentials`.
		const response = await fetch(url, {
			method: 'GET',
			headers
		});

		if (response.status === 404) {
			cache.update((m) => {
				disposeEntry(m[key]);
				return { ...m, [key]: { status: 'missing', version } };
			});
			return;
		}

		if (!response.ok) {
			cache.update((m) => {
				disposeEntry(m[key]);
				return { ...m, [key]: { status: 'error', version } };
			});
			return;
		}

		const blob = await response.blob();
		const objectUrl = URL.createObjectURL(blob);
		cache.update((m) => {
			// Rotate out any previous URL we held for this key. Required
			// because the page may re-request the same `(userId, version)`
			// after a logout / re-login, which would orphan the old blob.
			disposeEntry(m[key]);
			return { ...m, [key]: { status: 'ready', objectUrl, version } };
		});
	} catch {
		cache.update((m) => {
			disposeEntry(m[key]);
			return { ...m, [key]: { status: 'error', version } };
		});
	} finally {
		inflight.delete(key);
	}
}

export const avatarStore = {
	subscribe: cache.subscribe,
	/**
	 * Ensures an entry exists for `(userId, version)` and triggers a
	 * fetch when the cache is cold. Returns immediately; subscribers
	 * see the entry transition through `loading → ready|missing|error`.
	 */
	prime(userId: number, version: string | null | undefined): void {
		if (!browser) return;
		const key = keyOf(userId, version);
		const current = get(cache)[key];
		if (current) return;
		if (inflight.has(key)) return;

		cache.update((m) => ({ ...m, [key]: { status: 'loading', version } }));
		inflight.set(key, fetchAvatar(userId, version));
	},
	/**
	 * Drop every cached entry for a given user id (across all
	 * versions). The next `prime(...)` triggers a fresh fetch.
	 *
	 * Called after `POST /api/v2/me/avatar` so other components that
	 * still hold a stale `<UserAvatar userId={me} />` (the side bar,
	 * comment authors, etc.) re-fetch on their next render. We can't
	 * just bump a single `updatedAt` because the caller never sees
	 * the new value — there's no flow from the upload back into every
	 * AvatarImage prop. Pruning by user id sidesteps that.
	 */
	bumpUser(userId: number): void {
		cache.update((m) => {
			const next: CacheMap = { ...m };
			const prefix = `${userId}::`;
			for (const k of Object.keys(next)) {
				if (k.startsWith(prefix)) {
					disposeEntry(next[k]);
					delete next[k];
				}
			}
			return next;
		});
		// Drop any in-flight requests too so the next `prime` doesn't
		// short-circuit on a coalesced fetch that targets the stale
		// URL.
		for (const k of [...inflight.keys()]) {
			if (k.startsWith(`${userId}::`)) inflight.delete(k);
		}
	},
	/** Drop every cached entry — used on logout to free blob URLs. */
	clear(): void {
		cache.update((m) => {
			for (const k of Object.keys(m)) disposeEntry(m[k]);
			return {};
		});
		inflight.clear();
	}
};

export function getAvatarKey(userId: number, version: string | null | undefined): string {
	return keyOf(userId, version);
}

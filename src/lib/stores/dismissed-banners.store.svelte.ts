import { browser } from '$app/environment';
import type { Banner } from '$lib/services/banners.service';

/**
 * Local-only persistence of the banner IDs the current user has dismissed.
 *
 * Key shape: `${banner.id}:${banner.updated_at}`. Including `updated_at`
 * means an admin edit to the banner text/schedule/purpose forces the
 * dismissed record to no longer match, so the user sees the updated
 * banner again instead of it staying silently gone.
 *
 * Persisted in `localStorage` under `iris_dismissed_banners` and synced
 * across tabs via the `storage` event. Follows the same idiom as
 * `contexts/app.context.svelte.ts`.
 */
const STORAGE_KEY = 'iris_dismissed_banners';

type Persisted = Record<string, true>;

const bannerKey = (banner: Pick<Banner, 'id' | 'updated_at'>): string =>
	`${banner.id}:${banner.updated_at}`;

const safeParse = (json: string | null): Persisted | null => {
	if (!json) return null;
	try {
		const value = JSON.parse(json);
		if (value && typeof value === 'object') return value as Persisted;
		return null;
	} catch {
		return null;
	}
};

const state = $state<{ dismissed: Persisted }>({ dismissed: {} });
let initialized = false;

const persist = () => {
	if (!browser) return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state.dismissed));
};

const load = () => {
	if (!browser) return;
	const parsed = safeParse(localStorage.getItem(STORAGE_KEY));
	if (parsed) state.dismissed = parsed;
};

const hydrate = () => {
	if (!browser || initialized) return;
	initialized = true;

	load();

	$effect(() => {
		// Reference `state.dismissed` so this effect re-runs on any mutation.
		JSON.stringify(state.dismissed);
		persist();
	});

	window.addEventListener('storage', (e) => {
		if (e.key !== STORAGE_KEY) return;
		const next = safeParse(e.newValue);
		if (!next) return;
		state.dismissed = next;
	});
};

const isDismissed = (banner: Pick<Banner, 'id' | 'updated_at'>): boolean =>
	state.dismissed[bannerKey(banner)] === true;

const dismiss = (banner: Pick<Banner, 'id' | 'updated_at'>): void => {
	state.dismissed = { ...state.dismissed, [bannerKey(banner)]: true };
};

export const dismissedBanners = {
	hydrate,
	isDismissed,
	dismiss
};

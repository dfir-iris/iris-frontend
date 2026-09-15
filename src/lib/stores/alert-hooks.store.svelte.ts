/**
 * Module-scoped rune store for the manual module hooks registered
 * against alerts (`on_manual_trigger_alert`) — the buttons a module adds
 * to an alert.
 *
 * The list is the same for everyone and changes only when an admin
 * enables/disables a module, so it's fetched once per page load and
 * shared: the alerts queue renders dozens of cards, and one request per
 * card would be absurd. Consumers call `alertHooks.load()` freely — it
 * de-duplicates concurrent callers and no-ops once loaded.
 */
import { HooksService, type HookOption } from '$lib/services/hooks.service';

const state = $state<{ options: HookOption[] }>({ options: [] });

let inflight: Promise<void> | null = null;
let loaded = false;

export const alertHooks = {
	get options(): HookOption[] {
		return state.options;
	},

	async load(): Promise<void> {
		if (loaded) return;
		if (inflight) return inflight;

		inflight = (async () => {
			const response = await HooksService.list('alert');
			// A failure here means "no buttons this page load" — the hooks
			// are an optional extra, not something worth a toast on every
			// alerts visit.
			state.options = Array.isArray(response.data) ? response.data : [];
			loaded = true;
		})().finally(() => {
			inflight = null;
		});

		return inflight;
	},

	/** Test seam — drops the cache so the next `load()` refetches. */
	reset(): void {
		state.options = [];
		loaded = false;
		inflight = null;
	}
};

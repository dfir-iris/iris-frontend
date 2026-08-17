import { writable, get } from 'svelte/store';
import { DashboardService, type DashboardReviewRow } from '$lib/services/dashboard.service';

const POLL_INTERVAL_MS = 60_000;

export interface ReviewsState {
	items: DashboardReviewRow[];
	loading: boolean;
}

const initialState: ReviewsState = { items: [], loading: false };

function createReviewsStore() {
	const { subscribe, update, set } = writable<ReviewsState>(initialState);
	let pollTimer: ReturnType<typeof setInterval> | null = null;
	let initialised = false;

	async function load() {
		update((s) => ({ ...s, loading: true }));
		const res = await DashboardService.listReviews();
		if (res.ok && Array.isArray(res.data)) {
			update(() => ({ items: res.data as DashboardReviewRow[], loading: false }));
		} else {
			update((s) => ({ ...s, loading: false }));
		}
	}

	function start() {
		if (initialised) return;
		initialised = true;
		void load();
		pollTimer = setInterval(() => void load(), POLL_INTERVAL_MS);
	}

	function stop() {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
		initialised = false;
		set(initialState);
	}

	function count(): number {
		return get({ subscribe }).items.length;
	}

	return { subscribe, load, start, stop, count };
}

export const reviews = createReviewsStore();

// Legacy writables kept for the existing user-current-reviews-table component.
export const reviewsStore = { subscribe: reviews.subscribe };
export const isLoadingReviewsStore = {
	subscribe: (run: (v: boolean) => void) =>
		reviews.subscribe((s) => run(s.loading))
};

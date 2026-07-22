import { writable } from 'svelte/store';
import type { DashboardReviewRow } from '$lib/services/dashboard.service';

export const reviewsStore = writable<DashboardReviewRow[]>([]);
export const isLoadingReviewsStore = writable(true);
import { writable } from 'svelte/store';

export const reviewsStore = writable([]);
export const isLoadingReviewsStore = writable(true);
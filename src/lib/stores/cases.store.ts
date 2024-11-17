import { writable } from 'svelte/store';

// Store to hold the fetched cases
export const casesStore = writable([]);
export const isLoadingStore = writable(true);

import { writable } from 'svelte/store';

// Store to hold the fetched cases
export const assetsStore = writable([]);
export const isLoadingAssetsStore = writable(true);

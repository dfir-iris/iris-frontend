import { writable } from 'svelte/store';

export const tasksStore = writable([]);
export const isLoadingTasksStore = writable(true);
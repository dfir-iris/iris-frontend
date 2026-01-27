import { browser } from '$app/environment';
import { writable, get } from 'svelte/store';

export type AppContext = {
	currentCaseID: number;
};

const STORAGE_KEY = 'iris_app_context';

const DEFAULT_CONTEXT: AppContext = {
	currentCaseID: 1
};

function safeParse(json: string | null): AppContext | null {
	if (!json) return null;

	try {
		return JSON.parse(json) as AppContext;
	} catch {
		return null;
	}
}

function loadFromStorage(): AppContext {
	if (!browser) return DEFAULT_CONTEXT;

	const parsed = safeParse(localStorage.getItem(STORAGE_KEY));

	return parsed ? { ...DEFAULT_CONTEXT, ...parsed } : DEFAULT_CONTEXT;
}

export const appContext = writable<AppContext>(DEFAULT_CONTEXT);

let initialized = false;

export function initAppContextStore() {
	if (!browser || initialized) return;
	initialized = true;

	appContext.set(loadFromStorage());

	appContext.subscribe((value) => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
	});

	window.addEventListener('storage', (e) => {
		if (e.key !== STORAGE_KEY) return;
		const next = safeParse(e.newValue);

		if (!next) return;

		const current = get(appContext);
		const merged = { ...DEFAULT_CONTEXT, ...next };

		if (JSON.stringify(current) !== JSON.stringify(merged)) {
			appContext.set(merged);
		}
	});
}

import { browser } from '$app/environment';

export const APP_CTX = Symbol('app-context');

export type AppState = {
	currentCaseID: number;
};

const STORAGE_KEY = 'iris_app_context';

const DEFAULT_STATE: AppState = {
	currentCaseID: 1
};

const safeParse = (json: string | null): AppState | null => {
	if (!json) return null;
	try {
		return JSON.parse(json) as AppState;
	} catch {
		return null;
	}
};

export type AppContext = {
	state: AppState;
	init(): void;
};

export const createAppContext = (): AppContext => {
	// eslint-disable-next-line prefer-const
	let state = $state<AppState>({ ...DEFAULT_STATE });
	let initialized = false;

	const load = () => {
		if (!browser) return;

		const parsed = safeParse(localStorage.getItem(STORAGE_KEY));

		if (parsed) {
			Object.assign(state, { ...DEFAULT_STATE, ...parsed });
		}
	};

	const persist = () => {
		if (!browser) return;

		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	};

	const init = () => {
		if (!browser || initialized) return;
		initialized = true;

		load();

		$effect(() => persist());

		window.addEventListener('storage', (e) => {
			if (e.key !== STORAGE_KEY) return;

			const next = safeParse(e.newValue);
			if (!next) return;

			Object.assign(state, { ...DEFAULT_STATE, ...next });
		});
	};

	return {
		state,
		init
	};
};

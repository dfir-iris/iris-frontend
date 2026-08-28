import { vi } from 'vitest';
import type { Subscriber, Unsubscriber } from 'svelte/store';

// Global setup for the Vitest run. Referenced by `vitest.config.ts`.
//
// This file was previously wired up only from the `test` block in
// `vite.config.ts`, which Vitest ignores in favour of `vitest.config.ts` —
// so none of it actually ran. It is live now, which is why the mocks below
// are deliberately behaviour-preserving: several suites already register
// their own `vi.mock()` for these modules, and a per-file mock overrides
// this one.
import '@testing-library/jest-dom';

// Empty env on purpose. `API_BASE_URL` is
// `env.PUBLIC_INTERNAL_API_URL || '/api/v2'` (see lib/config/api.config.ts),
// so supplying a value here would silently repoint every service test at a
// different base URL. Leaving it unset exercises the real `/api/v2` default.
//
// (The previous version of this file mocked `PUBLIC_IRIS_API_URL` at
// `http://localhost:5000/api/v1`. That variable name appears nowhere else in
// the codebase — it was dead twice over: dead file, dead name.)
vi.mock('$env/dynamic/public', () => ({
	env: {}
}));

vi.mock('$env/static/public', () => ({}));

vi.mock('$app/stores', async () => {
	const { readable, writable } = await import('svelte/store');

	const getStores = () => ({
		navigating: readable(null),
		page: readable({ url: new URL('http://localhost'), params: {} }),
		session: writable(null),
		updated: readable(false)
	});

	const page = {
		subscribe(fn: Subscriber<{ url: URL; params: Record<string, string> }>): Unsubscriber {
			return getStores().page.subscribe(fn);
		}
	};

	const navigating = {
		subscribe(fn: Subscriber<null>): Unsubscriber {
			return getStores().navigating.subscribe(fn);
		}
	};

	const session = {
		subscribe(fn: Subscriber<null>): Unsubscriber {
			return getStores().session.subscribe(fn);
		}
	};

	const updated = {
		subscribe(fn: Subscriber<boolean>): Unsubscriber {
			return getStores().updated.subscribe(fn);
		}
	};

	return { getStores, page, navigating, session, updated };
});

vi.mock('$app/environment', () => ({
	browser: false,
	dev: true,
	building: false,
	version: 'any'
}));

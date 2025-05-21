import { vi } from 'vitest';

vi.mock('$env/dynamic/public', () => {
	console.log('Attempting to mock $env/dynamic/public'); // Diagnostic log
	const mockEnv = {
		PUBLIC_IRIS_API_URL: 'http://localhost:5000/api/v1', // Ensure this is what api.config.ts expects
		PUBLIC_USE_MOCK_API_DATA: 'false',
		// Add any other PUBLIC_ dynamic env variables your app or api.config.ts might use here
		// For example:
		// PUBLIC_ANOTHER_VAR: 'some_value',
	};
	console.log('$env/dynamic/public mock created with env:', mockEnv); // Diagnostic log
	return {
		env: mockEnv
	};
});

vi.mock('$env/static/public', () => {
	return {
		PUBLIC_USE_MOCK_API_DATA: 'false', // Or true, depending on your testing needs
		// Add other public static env variables your app uses
	};
});

// If you use $app/stores or other SvelteKit modules that need mocking for tests:
vi.mock('$app/stores', async () => {
	const { readable, writable } = await import('svelte/store');
	/**
	 * @type {import('$app/stores').getStores}
	 */
	const getStores = () => ({
		navigating: readable(null),
		page: readable({ url: new URL('http://localhost'), params: {} }),
		session: writable(null),
		updated: readable(false)
	});
	/**
	 * @type {typeof import('$app/stores').page}
	 */
	const page = {
		subscribe(fn) {
			return getStores().page.subscribe(fn);
		}
	};
	/**
	 * @type {typeof import('$app/stores').navigating}
	 */
	const navigating = {
		subscribe(fn) {
			return getStores().navigating.subscribe(fn);
		}
	};
	/**
	 * @type {typeof import('$app/stores').session}
	 */
	const session = {
		subscribe(fn) {
			return getStores().session.subscribe(fn);
		}
	};
	/**
	 * @type {typeof import('$app/stores').updated}
	 */
	const updated = {
		subscribe(fn) {
			return getStores().updated.subscribe(fn);
		}
	};
	return {
		getStores,
		page,
		navigating,
		session,
		updated
	};
});

vi.mock('$app/environment', () => ({
	browser: false, // or true if you want to simulate browser environment
	dev: true,
	building: false,
	version: 'any'
}));

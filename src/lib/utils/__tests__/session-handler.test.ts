import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$app/environment', () => ({ browser: true }));

vi.mock('$app/navigation', () => ({
	goto: vi.fn(() => Promise.resolve())
}));

vi.mock('$lib/stores/auth.store', () => ({
	auth: { clearAuth: vi.fn() }
}));

import { handleSessionExpiration } from '../session-handler';
import { goto } from '$app/navigation';
import { auth } from '$lib/stores/auth.store';

/** Point `window.location` at `url` for the duration of a test. */
const setLocation = (url: string) => {
	const parsed = new URL(url, 'https://iris.example.com');
	Object.defineProperty(window, 'location', {
		configurable: true,
		writable: true,
		value: {
			pathname: parsed.pathname,
			search: parsed.search,
			href: parsed.href
		}
	});
};

/** `handleSessionExpiration` defers its `goto` by one `setTimeout(…, 0)`. */
const flush = async () => {
	await vi.runAllTimersAsync();
};

describe('handleSessionExpiration', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('redirects to login carrying the current path', async () => {
		setLocation('/cases');

		handleSessionExpiration();
		await flush();

		expect(auth.clearAuth).toHaveBeenCalled();
		expect(goto).toHaveBeenCalledWith('/login?redirect=%2Fcases', { replaceState: true });
	});

	it('preserves the query string of the expired page', async () => {
		setLocation('/activities?page=2&q=login');

		handleSessionExpiration();
		await flush();

		expect(goto).toHaveBeenCalledWith('/login?redirect=%2Factivities%3Fpage%3D2%26q%3Dlogin', {
			replaceState: true
		});
	});

	// The regression this module exists to prevent. The old guard compared
	// `pathname + search` against the literal "/login", so any login URL that
	// already carried a `?redirect=` no longer matched and got wrapped again —
	// once per 401, until the URL outgrew the proxy's limit and sign-in broke.
	it('does not redirect when already on a login URL bearing a redirect param', async () => {
		setLocation('/login?redirect=%2Fcases');

		handleSessionExpiration();
		await flush();

		expect(goto).not.toHaveBeenCalled();
	});

	it('does not redirect from a bare login page', async () => {
		setLocation('/login');

		handleSessionExpiration();
		await flush();

		expect(goto).not.toHaveBeenCalled();
	});

	it('does not redirect from nested login routes such as MFA', async () => {
		setLocation('/login/mfa-verify?redirectTo=%2Fcases');

		handleSessionExpiration();
		await flush();

		expect(goto).not.toHaveBeenCalled();
	});

	// Bailing out early must also release the re-entrancy flag, otherwise the
	// first 401 seen on /login would wedge it and no later expiry — on a real
	// page — could ever redirect.
	it('still redirects on a later expiry after bailing out on /login', async () => {
		setLocation('/login');
		handleSessionExpiration();
		await flush();
		expect(goto).not.toHaveBeenCalled();

		setLocation('/cases');
		handleSessionExpiration();
		await flush();

		expect(goto).toHaveBeenCalledWith('/login?redirect=%2Fcases', { replaceState: true });
	});

	it('collapses a burst of expiries into a single redirect', async () => {
		setLocation('/cases');

		handleSessionExpiration();
		handleSessionExpiration();
		handleSessionExpiration();
		await flush();

		expect(goto).toHaveBeenCalledTimes(1);
	});
});

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('$app/navigation', () => ({
	goto: vi.fn()
}));

vi.mock('../auth.store', () => ({
	auth: {
		isAuthenticated: vi.fn()
	}
}));

const pageMock = vi.hoisted(() => {
	type PageLike = { url: URL };

	let value: PageLike = { url: new URL('https://example.com/') };
	const subs = new Set<(v: PageLike) => void>();

	return {
		subscribe(run: (v: PageLike) => void) {
			subs.add(run);
			run(value);
			return () => subs.delete(run);
		},
		set(v: PageLike) {
			value = v;
			for (const fn of subs) fn(value);
		}
	};
});

pageMock.set({ url: new URL('https://example.com/') });

vi.mock('$app/stores', () => ({
	page: pageMock
}));

import { navigation } from '../navigation.store';
import { goto } from '$app/navigation';
import { auth } from '../auth.store';

beforeEach(() => {
	vi.clearAllMocks();
	pageMock.set({ url: new URL('https://example.com/') }); // <-- reset between tests
});

describe('navigation store', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('redirects unauthenticated user from protected path to login', () => {
		(auth.isAuthenticated as unknown as Mock).mockReturnValue(false);

		const unsub = navigation.subscribe(() => {});

		pageMock.set({ url: new URL('https://example.com/cases') });

		expect(goto).toHaveBeenCalledWith('/login?redirect=%2Fcases');

		unsub();
	});

	it('redirects authenticated user away from public path to app root', () => {
		(auth.isAuthenticated as unknown as Mock).mockReturnValue(true);

		const unsub = navigation.subscribe(() => {});

		pageMock.set({ url: new URL('https://example.com/login') });

		expect(goto).toHaveBeenCalledWith('/');

		unsub();
	});

	it('does nothing for authenticated user on protected path', () => {
		(auth.isAuthenticated as unknown as Mock).mockReturnValue(true);

		const unsub = navigation.subscribe(() => {});

		pageMock.set({ url: new URL('https://example.com/cases') });

		expect(goto).not.toHaveBeenCalled();

		unsub();
	});

	it('does nothing for unauthenticated user on public path', () => {
		(auth.isAuthenticated as unknown as Mock).mockReturnValue(false);

		const unsub = navigation.subscribe(() => {});

		pageMock.set({ url: new URL('https://example.com/login') });

		expect(goto).not.toHaveBeenCalled();

		unsub();
	});
});

/**
 * Regression tests for the `/api/v2/*` proxy in hooks.server.ts.
 *
 * This proxy is the only thing that turns the HttpOnly session cookies
 * (`iris_at` / `iris_rt`) into what the Flask backend actually reads: an
 * `Authorization: Bearer` header, and a `refresh_token` field inside the
 * JSON body of the refresh endpoints. Any deployment that routes `/api/`
 * around this proxy 401s every call made after a browser reload and 400s
 * the follow-up refresh with "refresh token required".
 *
 * The third test covers the body-forwarding path: request bodies that are
 * not JSON rewrites must travel as raw bytes. Reading them with `.text()`
 * decodes UTF-8 with replacement, which silently corrupts every
 * multipart/form-data upload.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// SvelteKit's own `sequence` reads an AsyncLocalStorage request store that
// only exists inside a real server request. Compose the handlers the same
// way, without the store.
vi.mock('@sveltejs/kit/hooks', () => ({
	sequence:
		(...handlers: Array<(arg: { event: unknown; resolve: (e: unknown) => unknown }) => unknown>) =>
		({ event, resolve }: { event: unknown; resolve: (e: unknown) => unknown }) => {
			const run = (i: number, ev: unknown): unknown =>
				i === handlers.length
					? resolve(ev)
					: handlers[i]({ event: ev, resolve: (next: unknown) => run(i + 1, next) });
			return run(0, event);
		}
}));
vi.mock('@sentry/sveltekit', () => ({
	sentryHandle:
		() =>
		async ({ event, resolve }: never) =>
			(resolve as (e: unknown) => unknown)(event),
	handleErrorWithSentry: (fn: unknown) => fn
}));
vi.mock('$lib/observability/init', () => ({ initSentry: vi.fn() }));
vi.mock('sharp', () => ({ default: vi.fn() }));
vi.mock('$env/dynamic/private', () => ({ env: {} }));
vi.mock('$env/dynamic/public', () => ({
	env: { PUBLIC_INTERNAL_API_URL: 'http://app:8000/api/v2' }
}));

const { handle } = await import('../hooks.server');

/** Minimal RequestEvent stand-in — the proxy only reads `url` + `request`. */
const makeEvent = (request: Request) =>
	({
		url: new URL(request.url),
		request,
		cookies: { set: vi.fn(), delete: vi.fn() },
		setHeaders: vi.fn(),
		locals: {}
	}) as never;

const resolve = vi.fn(async () => new Response('unproxied', { status: 599 }));

const jsonBackendResponse = (payload: unknown, status = 200) =>
	new Response(JSON.stringify(payload), {
		status,
		headers: { 'content-type': 'application/json' }
	});

describe('hooks.server proxy — cookie to backend credential translation', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		resolve.mockClear();
		fetchMock = vi.fn(async () => jsonBackendResponse({ ok: true }));
		vi.stubGlobal('fetch', fetchMock);
	});

	it('turns the iris_at cookie into an Authorization header', async () => {
		const request = new Request('https://acme.cloud.seito.io/api/v2/auth/whoami', {
			method: 'GET',
			headers: { cookie: 'iris_at=access-abc; iris_rt=refresh-xyz' }
		});

		await handle({ event: makeEvent(request), resolve } as never);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://app:8000/api/v2/auth/whoami');
		expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-abc');
	});

	it('splices the iris_rt cookie into the refresh-token request body', async () => {
		const request = new Request('https://acme.cloud.seito.io/api/v2/auth/refresh-token', {
			method: 'POST',
			headers: {
				cookie: 'iris_at=access-abc; iris_rt=refresh-xyz',
				'content-type': 'application/json',
				origin: 'https://acme.cloud.seito.io'
			},
			body: '{}'
		});

		await handle({ event: makeEvent(request), resolve } as never);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(JSON.parse(init.body as string)).toEqual({ refresh_token: 'refresh-xyz' });
	});

	it('forwards a non-JSON body byte-for-byte', async () => {
		// 0x89 'P' 'N' 'G' + a lone 0xFF: not valid UTF-8. `.text()` would
		// turn every such byte into U+FFFD (EF BF BD) and corrupt the upload.
		const raw = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0xff, 0x00, 0xfe]);
		const request = new Request('https://acme.cloud.seito.io/api/v2/datastore/file/add', {
			method: 'POST',
			headers: {
				cookie: 'iris_at=access-abc',
				'content-type': 'multipart/form-data; boundary=x',
				origin: 'https://acme.cloud.seito.io'
			},
			body: raw
		});

		await handle({ event: makeEvent(request), resolve } as never);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
		expect(init.body).toBeInstanceOf(ArrayBuffer);
		expect(Array.from(new Uint8Array(init.body as ArrayBuffer))).toEqual(Array.from(raw));
	});
});

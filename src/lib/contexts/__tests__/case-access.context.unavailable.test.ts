import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/services/case.service', () => ({
	CaseService: { getMyAccess: vi.fn() }
}));

const { CaseService } = await import('$lib/services/case.service');
const { createCaseAccessContext } = await import('../case-access.context.svelte');

const getMyAccess = vi.mocked(CaseService.getMyAccess);

const answer = (status: number, data: unknown) =>
	getMyAccess.mockResolvedValue({
		status,
		ok: status >= 200 && status < 300,
		data,
		error: status >= 400 ? { message: `HTTP ${status}` } : undefined
	} as never);

const loaded = async () => {
	const ctx = createCaseAccessContext(() => 7);
	await ctx.load();
	return ctx;
};

beforeEach(() => {
	vi.clearAllMocks();
});

describe('case access — unavailable()', () => {
	it('is null before the lookup has answered', () => {
		const ctx = createCaseAccessContext(() => 7);
		expect(ctx.unavailable()).toBeNull();
	});

	it('is null for a readable case', async () => {
		answer(200, { access_level: 2 });
		expect((await loaded()).unavailable()).toBeNull();

		answer(200, { access_level: 4 });
		expect((await loaded()).unavailable()).toBeNull();
	});

	it('reports a missing case as not-found', async () => {
		answer(404, null);
		expect((await loaded()).unavailable()).toBe('not-found');
	});

	it('reports deny_all and a 403 as denied', async () => {
		answer(200, { access_level: 1 });
		expect((await loaded()).unavailable()).toBe('denied');

		answer(403, null);
		expect((await loaded()).unavailable()).toBe('denied');
	});

	it('reports a server or network failure as error, not denied', async () => {
		answer(500, null);
		expect((await loaded()).unavailable()).toBe('error');

		getMyAccess.mockRejectedValue(new Error('offline'));
		expect((await loaded()).unavailable()).toBe('error');
	});

	it('clears on reset', async () => {
		answer(404, null);
		const ctx = await loaded();
		ctx.reset();
		expect(ctx.unavailable()).toBeNull();
	});
});

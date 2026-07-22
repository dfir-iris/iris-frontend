import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/services/api.service', () => ({
	ApiService: {
		get: vi.fn()
	}
}));

// Regression guard: tlp.store previously fetched via `/manage/tlp/list`
// (the legacy v1 URL). That path is v2-prefixed to `/api/v2/manage/tlp/list`
// by ApiService, which doesn't exist on the backend and 404s silently.
// Pin the request URL so a future edit that reverts the ENDPOINTS constant
// fails at CI.
describe('tlp store — fetch URL contract', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('fetch() hits /manage/tlp (v2 taxonomy route), not the legacy /manage/tlp/list', async () => {
		const { ApiService } = await import('$lib/services/api.service');
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: []
		});

		const { tlpList } = await import('../tlp.store');
		await tlpList.fetch();

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/tlp');
	});
});

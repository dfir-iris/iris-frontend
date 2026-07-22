import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('$lib/services/api.service', () => ({
	ApiService: {
		get: vi.fn()
	}
}));

// Regression guard: ioc-types.store previously fetched via
// `/manage/ioc-types/list` (legacy v1). That path is v2-prefixed by
// ApiService to `/api/v2/manage/ioc-types/list`, which doesn't exist on
// the backend and 404s silently. Pin the request URL so a future edit
// that reverts the ENDPOINTS constant fails at CI.
describe('ioc-types store — fetch URL contract', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('fetch() hits /manage/case-objects/ioc-types (v2 sub-route), not the legacy /manage/ioc-types/list', async () => {
		const { ApiService } = await import('$lib/services/api.service');
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: []
		});

		const { iocTypes } = await import('../ioc-types.store');
		await iocTypes.fetch();

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/case-objects/ioc-types');
	});
});

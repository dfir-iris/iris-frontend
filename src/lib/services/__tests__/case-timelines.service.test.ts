import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { CaseTimelinesService } from '../case-timelines.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';

describe('CaseTimelinesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() hits /cases/<id>/timelines', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		const mockResponse = { ok: true, status: 200, data: [] };
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTimelinesService.list(7, options);

		expect(ApiService.get).toHaveBeenCalledWith('/cases/7/timelines', options);
		expect(res).toBe(mockResponse);
	});

	it('create() POSTs the body to /cases/<id>/timelines', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		const body = { name: 'Network', color: '#00aa55' };
		const mockResponse = { ok: true, status: 201, data: { timeline_id: 1 } };
		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTimelinesService.create(7, body, options);

		expect(ApiService.post).toHaveBeenCalledWith('/cases/7/timelines', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() PUTs to the by-id endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		const body = { name: 'Renamed' };
		const mockResponse = { ok: true, status: 200, data: { timeline_id: 9, name: 'Renamed' } };
		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTimelinesService.update(7, 9, body, options);

		expect(ApiService.put).toHaveBeenCalledWith('/cases/7/timelines/9', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() DELETEs the by-id endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		const mockResponse = { ok: true, status: 204, data: null };
		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTimelinesService.remove(7, 9, options);

		expect(ApiService.delete).toHaveBeenCalledWith('/cases/7/timelines/9', options);
		expect(res).toBe(mockResponse);
	});

	it('get() hits /cases/<id>/timelines/<id>', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		const mockResponse = { ok: true, status: 200, data: { timeline_id: 9 } };
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseTimelinesService.get(7, 9, options);

		expect(ApiService.get).toHaveBeenCalledWith('/cases/7/timelines/9', options);
		expect(res).toBe(mockResponse);
	});
});

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

import { AnalysisStatusService } from '../analysis-status.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type { AnalysisStatusItem } from '../analysis-status.service';

describe('AnalysisStatusService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() hits the case-agnostic v2 endpoint and unwraps the envelope', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const items: AnalysisStatusItem[] = [
			{ id: 1, name: 'Unspecified' },
			{ id: 6, name: 'Done' }
		];

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				data: items
			}
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AnalysisStatusService.list(73, options);

		// `caseId` argument is accepted but ignored — the legacy
		// `cid` query param is gone on v2.
		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/analysis-statuses', options);
		expect(res.data).toBe(items);
	});

	it('list() returns empty array when response data is invalid', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: false,
			status: 500,
			data: null
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AnalysisStatusService.list(73, options);

		expect(res.data).toEqual([]);
	});

	it('get() falls back to filtering the full list', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		// v2 doesn't expose a bare /<id> endpoint for analysis
		// statuses (the table has a handful of rows, so a full list
		// fetch is cheap). The service's `get()` filters the list
		// locally so the caller's signature stays unchanged.
		const items: AnalysisStatusItem[] = [
			{ id: 1, name: 'Unspecified' },
			{ id: 6, name: 'Done' }
		];

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { data: items }
		});

		const res = await AnalysisStatusService.get(6, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/analysis-statuses', options);
		expect(res.data).toEqual({ id: 6, name: 'Done' });
	});

	it('get() returns null when the list is empty', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 404,
			data: null
		});

		const res = await AnalysisStatusService.get(6, options);

		expect(res.data).toBeNull();
	});
});

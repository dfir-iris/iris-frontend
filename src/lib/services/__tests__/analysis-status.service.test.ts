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

	it('list() should build query and return unwrapped analysis statuses', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const items: AnalysisStatusItem[] = [
			{ id: 1, name: 'Unspecified' },
			{ id: 6, name: 'Done' }
		];

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				data: items,
				message: 'ok',
				status: 'success'
			}
		};

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			'/manage/analysis-status/list?cid=73'
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AnalysisStatusService.list(73, options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith('/manage/analysis-status/list', {
			cid: 73
		});
		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/analysis-status/list?cid=73', options);
		expect(res.data).toBe(items);
	});

	it('list() should return empty array when response data is invalid', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: false,
			status: 500,
			data: null
		};

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			'/manage/analysis-status/list?cid=73'
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AnalysisStatusService.list(73, options);

		expect(res.data).toEqual([]);
	});

	it('get() should call ApiService.get with /manage/analysis-status/{id} and return unwrapped status', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const item: AnalysisStatusItem = {
			id: 6,
			name: 'Done'
		};

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				data: item,
				message: 'ok',
				status: 'success'
			}
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AnalysisStatusService.get(6, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/analysis-status/6', options);
		expect(res.data).toBe(item);
	});

	it('get() should return null when response data is invalid', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: false,
			status: 404,
			data: null
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AnalysisStatusService.get(6, options);

		expect(res.data).toBeNull();
	});
});

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

import { SeveritiesService } from '../severities.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';
import type { Severity } from '../severities.service';

describe('CaseSeveritiesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should call ApiService.get with /manage/severities/list + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: [
				{
					severity_id: 1,
					severity_name: 'Low',
					severity_description: 'Low severity'
				}
			] satisfies Severity[]
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await SeveritiesService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/severities/list', options);
		expect(res).toBe(mockResponse);
	});
});

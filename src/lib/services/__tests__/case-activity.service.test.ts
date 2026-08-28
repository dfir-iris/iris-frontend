import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		get: vi.fn()
	}
}));

import { CaseActivityService } from '../case-activity.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';

describe('CaseActivityService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('list() calls ApiService.get with the correct case-scoped path', async () => {
		const mockResponse = {
			ok: true,
			status: 200,
			data: [
				{
					name: 'analyst1',
					user_id: 7,
					activity_date: '2024-01-15T10:00:00Z',
					activity_desc: 'Added IOC',
					is_from_api: false
				}
			]
		};
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const result = await CaseActivityService.list(42);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/42/activities', {});
		expect(result).toBe(mockResponse);
	});

	it('list() forwards API options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, data: [] });

		await CaseActivityService.list(99, options);

		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/99/activities', options);
	});

	it('list() uses caseId correctly in the path', async () => {
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, data: [] });

		await CaseActivityService.list(1001);

		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/1001/activities', {});
	});
});

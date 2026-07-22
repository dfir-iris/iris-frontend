import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { DashboardService } from '../dashboard.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';

describe('DashboardService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('get() hits /dashboard/kpis and returns the compact KPI block', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				assigned_alerts: {
					count: 3,
					filter: {
						alert_owner_id: 42,
						alert_status_id: [1, 2, 3]
					}
				},
				open_cases_count: 7,
				cases_closed_last_30d: 11
			}
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await DashboardService.get(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/dashboard/kpis', options);
		expect(res).toBe(mockResponse);
	});

	it('listReviews() hits /dashboard/reviews/list (v2), not the legacy /user/reviews/list', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: [
				{
					case_id: 5,
					case_name: 'Incident 5',
					status_id: 2,
					review_status: { status_name: 'Pending' }
				}
			]
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await DashboardService.listReviews(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/dashboard/reviews/list', options);
		expect(res).toBe(mockResponse);
	});
});

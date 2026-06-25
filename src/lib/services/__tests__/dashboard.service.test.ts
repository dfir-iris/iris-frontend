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
});

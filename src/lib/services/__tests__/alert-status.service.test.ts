import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn()
	}
}));

import { AlertStatusService } from '../alert-status.service';
import { ApiService } from '../api.service';

const mockWithQuery = ApiService.withQuery as unknown as ReturnType<typeof vi.fn>;
const mockGet = ApiService.get as unknown as ReturnType<typeof vi.fn>;

describe('AlertStatusService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWithQuery.mockReturnValue('/manage/alert-statuses?per_page=10000');
		mockGet.mockResolvedValue({ ok: true, data: [] });
	});

	describe('list', () => {
		it('calls withQuery with per_page=10000 to surface all statuses', async () => {
			await AlertStatusService.list();
			expect(ApiService.withQuery).toHaveBeenCalledWith('/manage/alert-statuses', {
				per_page: 10000
			});
		});

		it('calls get with the url returned by withQuery', async () => {
			const builtUrl = '/manage/alert-statuses?per_page=10000';
			mockWithQuery.mockReturnValue(builtUrl);
			await AlertStatusService.list();
			expect(ApiService.get).toHaveBeenCalledWith(builtUrl, {});
		});

		it('returns the response from ApiService.get', async () => {
			const statuses = [
				{ status_id: 1, status_name: 'New' },
				{ status_id: 2, status_name: 'In Progress' },
				{ status_id: 3, status_name: 'Closed' }
			];
			mockGet.mockResolvedValueOnce({ ok: true, data: statuses });
			const result = await AlertStatusService.list();
			expect(result).toEqual({ ok: true, data: statuses });
		});

		it('passes ApiOptions to get', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertStatusService.list(opts);
			expect(ApiService.get).toHaveBeenCalledWith(expect.any(String), opts);
		});

		it('does not call post, put, patch, or delete', async () => {
			await AlertStatusService.list();
			expect(ApiService.post).not.toHaveBeenCalled();
			expect(ApiService.put).not.toHaveBeenCalled();
			expect(ApiService.patch).not.toHaveBeenCalled();
			expect(ApiService.delete).not.toHaveBeenCalled();
		});
	});
});

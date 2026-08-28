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

import { ActivitiesService } from '../activities.service';
import { ApiService } from '../api.service';

const mockWithQuery = ApiService.withQuery as unknown as ReturnType<typeof vi.fn>;
const mockGet = ApiService.get as unknown as ReturnType<typeof vi.fn>;

describe('ActivitiesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWithQuery.mockReturnValue('/api/v2/activities?page=1');
		mockGet.mockResolvedValue({ ok: true, data: { data: [], total: 0 } });
	});

	describe('list', () => {
		it('calls withQuery and get with empty params', async () => {
			mockWithQuery.mockReturnValue('/api/v2/activities');
			const result = await ActivitiesService.list();
			expect(ApiService.withQuery).toHaveBeenCalledWith(
				'/api/v2/activities',
				expect.objectContaining({})
			);
			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/activities', {});
			expect(result).toEqual({ ok: true, data: { data: [], total: 0 } });
		});

		it('passes pagination params through', async () => {
			await ActivitiesService.list({ page: 2, per_page: 50 });
			const [, query] = mockWithQuery.mock.calls[0];
			expect(query.page).toBe(2);
			expect(query.per_page).toBe(50);
		});

		it('passes a non-empty search string through', async () => {
			await ActivitiesService.list({ search: 'malware' });
			const [, query] = mockWithQuery.mock.calls[0];
			expect(query.search).toBe('malware');
		});

		it('trims leading/trailing whitespace from search', async () => {
			await ActivitiesService.list({ search: '  malware  ' });
			const [, query] = mockWithQuery.mock.calls[0];
			expect(query.search).toBe('malware');
		});

		it('omits search when the string is only whitespace', async () => {
			await ActivitiesService.list({ search: '   ' });
			const [, query] = mockWithQuery.mock.calls[0];
			expect(query.search).toBeUndefined();
		});

		it('omits search when it is an empty string', async () => {
			await ActivitiesService.list({ search: '' });
			const [, query] = mockWithQuery.mock.calls[0];
			expect(query.search).toBeUndefined();
		});

		describe('tri-state boolean: include_non_case', () => {
			it('serialises true as the string "true"', async () => {
				await ActivitiesService.list({ include_non_case: true });
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.include_non_case).toBe('true');
			});

			it('serialises false as the string "false"', async () => {
				await ActivitiesService.list({ include_non_case: false });
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.include_non_case).toBe('false');
			});

			it('omits the key when undefined', async () => {
				await ActivitiesService.list({});
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.include_non_case).toBeUndefined();
			});
		});

		describe('tri-state boolean: is_from_api', () => {
			it('serialises true as the string "true"', async () => {
				await ActivitiesService.list({ is_from_api: true });
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.is_from_api).toBe('true');
			});

			it('serialises false as the string "false"', async () => {
				await ActivitiesService.list({ is_from_api: false });
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.is_from_api).toBe('false');
			});

			it('omits the key when undefined', async () => {
				await ActivitiesService.list({});
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.is_from_api).toBeUndefined();
			});
		});

		describe('tri-state boolean: is_manual', () => {
			it('serialises true as the string "true"', async () => {
				await ActivitiesService.list({ is_manual: true });
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.is_manual).toBe('true');
			});

			it('serialises false as the string "false"', async () => {
				await ActivitiesService.list({ is_manual: false });
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.is_manual).toBe('false');
			});

			it('omits the key when undefined', async () => {
				await ActivitiesService.list({});
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.is_manual).toBeUndefined();
			});
		});

		describe('csv arrays: user_ids', () => {
			it('joins multiple ids with commas', async () => {
				await ActivitiesService.list({ user_ids: [1, 2, 3] });
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.user_ids).toBe('1,2,3');
			});

			it('handles a single id', async () => {
				await ActivitiesService.list({ user_ids: [7] });
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.user_ids).toBe('7');
			});

			it('omits the key for an empty array', async () => {
				await ActivitiesService.list({ user_ids: [] });
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.user_ids).toBeUndefined();
			});

			it('omits the key when undefined', async () => {
				await ActivitiesService.list({});
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.user_ids).toBeUndefined();
			});
		});

		describe('csv arrays: case_ids', () => {
			it('joins multiple ids with commas', async () => {
				await ActivitiesService.list({ case_ids: [4, 5] });
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.case_ids).toBe('4,5');
			});

			it('omits the key for an empty array', async () => {
				await ActivitiesService.list({ case_ids: [] });
				const [, query] = mockWithQuery.mock.calls[0];
				expect(query.case_ids).toBeUndefined();
			});
		});

		it('passes scalar user_id and case_id through', async () => {
			await ActivitiesService.list({ user_id: 10, case_id: 20 });
			const [, query] = mockWithQuery.mock.calls[0];
			expect(query.user_id).toBe(10);
			expect(query.case_id).toBe(20);
		});

		it('passes date_from and date_to through', async () => {
			await ActivitiesService.list({ date_from: '2024-01-01', date_to: '2024-12-31' });
			const [, query] = mockWithQuery.mock.calls[0];
			expect(query.date_from).toBe('2024-01-01');
			expect(query.date_to).toBe('2024-12-31');
		});

		it('omits date_from and date_to when empty strings', async () => {
			await ActivitiesService.list({ date_from: '', date_to: '' });
			const [, query] = mockWithQuery.mock.calls[0];
			expect(query.date_from).toBeUndefined();
			expect(query.date_to).toBeUndefined();
		});

		it('passes ApiOptions to ApiService.get', async () => {
			const opts = { signal: new AbortController().signal };
			await ActivitiesService.list({}, opts);
			expect(ApiService.get).toHaveBeenCalledWith(expect.any(String), opts);
		});

		it('uses the path returned by withQuery as the get argument', async () => {
			const builtPath = '/api/v2/activities?page=3&per_page=25';
			mockWithQuery.mockReturnValue(builtPath);
			await ActivitiesService.list({ page: 3, per_page: 25 });
			expect(ApiService.get).toHaveBeenCalledWith(builtPath, {});
		});

		it('returns the response from ApiService.get', async () => {
			const response = { ok: true, data: { data: [{ id: 1 }], total: 1 } };
			mockGet.mockResolvedValueOnce(response);
			const result = await ActivitiesService.list();
			expect(result).toBe(response);
		});
	});
});

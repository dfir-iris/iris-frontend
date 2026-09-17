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

import { CaseService } from '../case.service';
import { ApiService } from '../api.service';

import type { Case } from '$lib/types/resources/case';
import type { Paginated, ApiOptions } from '../api.service';
import type {
	CreateCaseBody,
	UpdateCaseBody,
	ListCasesParams,
	FilterCasesParams
} from '../case.service';

describe('CaseService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should build query and call ApiService.get with built path + options', async () => {
		const params: ListCasesParams = {
			page: 1,
			per_page: 25,
			case_ids: [73, 84, 87],
			is_open: true,
			sort_dir: 'desc'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const builtPath =
			'/api/v2/cases?page=1&per_page=25&case_ids=73,84,87&is_open=true&sort_dir=desc';

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				total: 1,
				data: [{ case_id: 73, case_uuid: 'uuid-73' } as unknown as Case],
				last_page: 1,
				current_page: 1,
				next_page: null
			} satisfies Paginated<Case>
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseService.list(params, options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith(
			'/api/v2/cases',
			params as Record<string, unknown>
		);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(builtPath, options);

		expect(res).toBe(mockResponse);
	});

	it('get() should call ApiService.get with /api/v2/cases/{id} + options', async () => {
		const mockCase = { case_id: 73, case_uuid: 'uuid-73' } as unknown as Case;

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: mockCase
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseService.get(73, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/73', options);
		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /api/v2/cases, body, options', async () => {
		const body: CreateCaseBody = {
			case_name: 'My Case',
			case_description: 'desc',
			case_customer_id: 1,
			case_soc_id: 'SOC_154'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { case_id: 100, case_uuid: 'uuid-100' } as unknown as Case
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseService.create(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.put with /api/v2/cases/{id}, body casted, options', async () => {
		const body: UpdateCaseBody = {
			state_id: 3,
			case_tags: 'tag1,tag2'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { case_id: 73, case_uuid: 'uuid-73' } as unknown as Case
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseService.update(73, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		// Service casts body to Case before passing into ApiService.put
		expect(ApiService.put).toHaveBeenCalledWith(
			'/api/v2/cases/73',
			body as unknown as Case,
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('update() should forward closing_note alongside state_id in a single PUT', async () => {
		// Closing a case and recording why must be one request: a second
		// write that failed would leave the case closed with no explanation.
		const body: UpdateCaseBody = {
			state_id: 3,
			closing_note: 'Confirmed false positive — vendor scanner.'
		};

		const mockResponse = {
			ok: true,
			status: 200,
			data: { case_id: 73, closing_note: body.closing_note } as unknown as Case
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseService.update(73, body);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/api/v2/cases/73', body as unknown as Case, {});
		expect(res).toBe(mockResponse);
	});

	it('update() should forward a null closing_note so the column can be cleared', async () => {
		const body: UpdateCaseBody = { closing_note: null };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { case_id: 73, closing_note: null } as unknown as Case
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		await CaseService.update(73, body);

		expect(ApiService.put).toHaveBeenCalledWith(
			'/api/v2/cases/73',
			expect.objectContaining({ closing_note: null }),
			{}
		);
	});

	it('remove() should call ApiService.delete with /api/v2/cases/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseService.remove(73, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/73', options);
		expect(res).toBe(mockResponse);
	});

	// Regression: the Overview queue sorts server-side through this endpoint.
	// The API reads the direction from `sort_dir` (see
	// `parse_pagination_parameters`) — sending `direction` instead silently
	// falls back to ascending, so the sort keys must reach the query verbatim.
	it('filter() should forward order_by + sort_dir to the query', async () => {
		const params: FilterCasesParams = {
			page: 2,
			per_page: 25,
			order_by: 'open_date',
			sort_dir: 'desc'
		};

		const builtPath = '/api/v2/cases/filter?page=2&per_page=25&order_by=open_date&sort_dir=desc';

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);

		const mockResponse = {
			ok: true,
			status: 200,
			data: { total: 0, cases: [] as Case[] }
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseService.filter(params);

		expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/cases/filter', {
			page: 2,
			per_page: 25,
			order_by: 'open_date',
			sort_dir: 'desc',
			case_ids: undefined
		});

		expect(ApiService.get).toHaveBeenCalledWith(builtPath, {});
		expect(res).toBe(mockResponse);
	});
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { SearchService } from '../search.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type { SearchParams, SearchEnvelope, IocRow, NoteRow } from '../search.service';

describe('SearchService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ---- Helpers -------------------------------------------------------------

	const mockEnvelope = (rows: SearchEnvelope['data'] = []): SearchEnvelope => ({
		data: rows,
		pagination: { total: rows.length, page: 1, per_page: 25, total_pages: 1 }
	});

	// ---- search() — query construction ---------------------------------------

	describe('search() — query parameter construction', () => {
		it('should call ApiService.withQuery with the correct base path', async () => {
			const builtPath = '/search?value=malware&types=ioc&page=1&per_page=25';
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			const params: SearchParams = { value: 'malware', types: ['ioc'] };
			await SearchService.search(params);

			expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
			expect(ApiService.withQuery).toHaveBeenCalledWith('/search', {
				value: 'malware',
				types: 'ioc',
				page: 1,
				per_page: 25
			});
		});

		it('should join multiple types with a comma', async () => {
			const builtPath = '/search?value=test&types=ioc%2Cassets&page=1&per_page=25';
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			const params: SearchParams = { value: 'test', types: ['ioc', 'assets'] };
			await SearchService.search(params);

			expect(ApiService.withQuery).toHaveBeenCalledWith('/search', expect.objectContaining({
				types: 'ioc,assets'
			}));
		});

		it('should join all eight search types when all are passed', async () => {
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			const params: SearchParams = {
				value: 'q',
				types: ['ioc', 'notes', 'comments', 'assets', 'events', 'tasks', 'evidences', 'summaries']
			};
			await SearchService.search(params);

			expect(ApiService.withQuery).toHaveBeenCalledWith('/search', expect.objectContaining({
				types: 'ioc,notes,comments,assets,events,tasks,evidences,summaries'
			}));
		});

		it('should default page to 1 and per_page to 25 when not supplied', async () => {
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			const params: SearchParams = { value: 'x', types: ['events'] };
			await SearchService.search(params);

			expect(ApiService.withQuery).toHaveBeenCalledWith('/search', expect.objectContaining({
				page: 1,
				per_page: 25
			}));
		});

		it('should use explicit page and per_page values when supplied', async () => {
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			const params: SearchParams = { value: 'x', types: ['tasks'], page: 3, per_page: 10 };
			await SearchService.search(params);

			expect(ApiService.withQuery).toHaveBeenCalledWith('/search', expect.objectContaining({
				page: 3,
				per_page: 10
			}));
		});

		it('should include case_id in the query when provided', async () => {
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			const params: SearchParams = { value: 'x', types: ['notes'], case_id: 7 };
			await SearchService.search(params);

			expect(ApiService.withQuery).toHaveBeenCalledWith('/search', expect.objectContaining({
				case_id: 7
			}));
		});

		it('should NOT include case_id when it is undefined', async () => {
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			const params: SearchParams = { value: 'x', types: ['notes'] };
			await SearchService.search(params);

			const callArg = (ApiService.withQuery as ReturnType<typeof vi.fn>).mock.calls[0][1];
			expect(callArg).not.toHaveProperty('case_id');
		});

		it('should NOT include case_id when it is null (coerced to undefined by != null guard)', async () => {
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			// Casting to any to simulate a consumer accidentally passing null at runtime
			const params = { value: 'x', types: ['notes'], case_id: null } as unknown as SearchParams;
			await SearchService.search(params);

			const callArg = (ApiService.withQuery as ReturnType<typeof vi.fn>).mock.calls[0][1];
			expect(callArg).not.toHaveProperty('case_id');
		});

		it('should include case_ids as a comma-joined string when the array is non-empty', async () => {
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			const params: SearchParams = { value: 'x', types: ['assets'], case_ids: [1, 2, 3] };
			await SearchService.search(params);

			expect(ApiService.withQuery).toHaveBeenCalledWith('/search', expect.objectContaining({
				case_ids: '1,2,3'
			}));
		});

		it('should NOT include case_ids when the array is empty', async () => {
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			const params: SearchParams = { value: 'x', types: ['assets'], case_ids: [] };
			await SearchService.search(params);

			const callArg = (ApiService.withQuery as ReturnType<typeof vi.fn>).mock.calls[0][1];
			expect(callArg).not.toHaveProperty('case_ids');
		});

		it('should NOT include case_ids when the field is absent', async () => {
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			const params: SearchParams = { value: 'x', types: ['assets'] };
			await SearchService.search(params);

			const callArg = (ApiService.withQuery as ReturnType<typeof vi.fn>).mock.calls[0][1];
			expect(callArg).not.toHaveProperty('case_ids');
		});

		it('should include both case_id and case_ids when both are provided', async () => {
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			const params: SearchParams = { value: 'x', types: ['ioc'], case_id: 5, case_ids: [5, 6] };
			await SearchService.search(params);

			expect(ApiService.withQuery).toHaveBeenCalledWith('/search', expect.objectContaining({
				case_id: 5,
				case_ids: '5,6'
			}));
		});
	});

	// ---- search() — ApiService.get delegation --------------------------------

	describe('search() — ApiService.get delegation', () => {
		it('should call ApiService.get with the path returned by withQuery and default options', async () => {
			const builtPath = '/search?value=malware&types=ioc&page=1&per_page=25';
			const mockResponse = { ok: true, status: 200, data: mockEnvelope() };

			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await SearchService.search({ value: 'malware', types: ['ioc'] });

			expect(ApiService.get).toHaveBeenCalledTimes(1);
			expect(ApiService.get).toHaveBeenCalledWith(builtPath, {});
			expect(res).toBe(mockResponse);
		});

		it('should forward custom ApiOptions to ApiService.get', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			const builtPath = '/search?value=q&types=notes&page=1&per_page=25';
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockEnvelope() });

			await SearchService.search({ value: 'q', types: ['notes'] }, options);

			expect(ApiService.get).toHaveBeenCalledWith(builtPath, options);
		});

		it('should return the response from ApiService.get unchanged', async () => {
			const iocRow: IocRow = {
				type: 'ioc',
				result_id: 1,
				case_id: 10,
				case_name: 'Case Alpha',
				customer_name: 'Acme',
				ioc_id: 1,
				ioc_name: '8.8.8.8',
				ioc_description: null,
				ioc_misp: null,
				type_name: 'IP',
				tlp_name: 'WHITE',
				tlp_bscolor: null
			};

			const mockResponse = { ok: true, status: 200, data: mockEnvelope([iocRow]) };
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await SearchService.search({ value: '8.8.8.8', types: ['ioc'] });

			expect(res).toBe(mockResponse);
		});
	});

	// ---- search() — mixed result-type rows -----------------------------------

	describe('search() — mixed row types in response', () => {
		it('should handle an empty result set', async () => {
			const mockResponse = { ok: true, status: 200, data: mockEnvelope([]) };
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await SearchService.search({ value: 'nothing', types: ['ioc'] });

			expect((res as { data: SearchEnvelope }).data.data).toHaveLength(0);
		});

		it('should handle a note row in the response', async () => {
			const noteRow: NoteRow = {
				type: 'notes',
				result_id: 2,
				case_id: 10,
				case_name: 'Case Alpha',
				customer_name: 'Acme',
				note_id: 2,
				note_title: 'Initial triage'
			};
			const mockResponse = { ok: true, status: 200, data: mockEnvelope([noteRow]) };
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await SearchService.search({ value: 'triage', types: ['notes'] });

			expect(res).toBe(mockResponse);
		});

		it('should handle pagination metadata returned by the server', async () => {
			const envelope: SearchEnvelope = {
				data: [],
				pagination: { total: 100, page: 2, per_page: 10, total_pages: 10 }
			};
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce('/search?...');
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: envelope });

			const res = await SearchService.search({ value: 'x', types: ['tasks'], page: 2, per_page: 10 });

			expect((res as { data: SearchEnvelope }).data.pagination.total_pages).toBe(10);
		});
	});
});

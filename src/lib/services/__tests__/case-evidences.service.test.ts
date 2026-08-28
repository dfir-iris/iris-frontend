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

import { CaseEvidencesService } from '../case-evidences.service';
import { ApiService } from '../api.service';

import type { ApiOptions, Paginated } from '../api.service';
import type { Evidence } from '$lib/types/resources/evidence';
import type {
	ListCaseEvidencesParams,
	CreateCaseEvidenceBody,
	UpdateCaseEvidenceBody
} from '../case-evidences.service';

// ---- Fixtures ----------------------------------------------------------------

const mockEvidence: Evidence = {
	evidence_id: 10,
	filename: 'memory.dmp',
	file_description: 'RAM capture',
	file_hash: 'abc123',
	file_size: 1024,
	type_id: 2,
	acquisition_date: '2024-01-15T10:00:00Z',
	start_date: null,
	end_date: null,
	chain_of_custody: {},
	custom_attributes: {}
} as unknown as Evidence;

const mockPaginatedEvidence: Paginated<Evidence> = {
	data: [mockEvidence],
	total: 1,
	last_page: 1,
	current_page: 1,
	next_page: null
};

describe('CaseEvidencesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ---- list() --------------------------------------------------------------

	describe('list()', () => {
		it('should call ApiService.withQuery with the correct base path including caseId', async () => {
			const builtPath = '/api/v2/cases/5/evidences?page=1&per_page=25';
			const params: ListCaseEvidencesParams = { page: 1, per_page: 25 };

			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: mockPaginatedEvidence
			});

			await CaseEvidencesService.list(5, params);

			expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
			expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/cases/5/evidences', params);
		});

		it('should call ApiService.get with the path returned by withQuery and default options', async () => {
			const builtPath = '/api/v2/cases/5/evidences?page=1&per_page=25';
			const mockResponse = { ok: true, status: 200, data: mockPaginatedEvidence };

			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await CaseEvidencesService.list(5, {});

			expect(ApiService.get).toHaveBeenCalledTimes(1);
			expect(ApiService.get).toHaveBeenCalledWith(builtPath, {});
			expect(res).toBe(mockResponse);
		});

		it('should embed the caseId correctly for different cases', async () => {
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce(
				'/api/v2/cases/99/evidences'
			);
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: mockPaginatedEvidence
			});

			await CaseEvidencesService.list(99);

			expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/cases/99/evidences', {});
		});

		it('should pass all supported query params to withQuery', async () => {
			const params: ListCaseEvidencesParams = {
				page: 2,
				per_page: 10,
				order_by: 'filename',
				sort_dir: 'desc',
				custom_conditions: 'file_size > 1000'
			};

			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce(
				'/api/v2/cases/1/evidences?...'
			);
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: mockPaginatedEvidence
			});

			await CaseEvidencesService.list(1, params);

			expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/cases/1/evidences', params);
		});

		it('should use an empty params object by default', async () => {
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce(
				'/api/v2/cases/3/evidences'
			);
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: mockPaginatedEvidence
			});

			await CaseEvidencesService.list(3);

			expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/cases/3/evidences', {});
		});

		it('should forward custom ApiOptions to ApiService.get', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce(
				'/api/v2/cases/1/evidences'
			);
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: mockPaginatedEvidence
			});

			await CaseEvidencesService.list(1, {}, options);

			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/1/evidences', options);
		});

		it('should support sort_dir:asc', async () => {
			const params: ListCaseEvidencesParams = { sort_dir: 'asc' };
			(ApiService.withQuery as ReturnType<typeof vi.fn>).mockReturnValueOnce(
				'/api/v2/cases/1/evidences?sort_dir=asc'
			);
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: mockPaginatedEvidence
			});

			await CaseEvidencesService.list(1, params);

			expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/cases/1/evidences', params);
		});
	});

	// ---- get() ---------------------------------------------------------------

	describe('get()', () => {
		it('should call ApiService.get with /api/v2/cases/{caseId}/evidences/{evidenceId} and default options', async () => {
			const mockResponse = { ok: true, status: 200, data: mockEvidence };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await CaseEvidencesService.get(5, 10);

			expect(ApiService.get).toHaveBeenCalledTimes(1);
			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/5/evidences/10', {});
			expect(res).toBe(mockResponse);
		});

		it('should embed both caseId and evidenceId correctly in the URL', async () => {
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: mockEvidence
			});

			await CaseEvidencesService.get(42, 99);

			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/42/evidences/99', {});
		});

		it('should forward custom ApiOptions to ApiService.get', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: mockEvidence
			});

			await CaseEvidencesService.get(5, 10, options);

			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/5/evidences/10', options);
		});
	});

	// ---- create() ------------------------------------------------------------

	describe('create()', () => {
		it('should call ApiService.post with /api/v2/cases/{caseId}/evidences, body, and default options', async () => {
			const body: CreateCaseEvidenceBody = {
				filename: 'disk.img',
				file_description: 'Full disk image',
				file_hash: 'deadbeef',
				file_size: 4096,
				type_id: 1
			};
			const mockResponse = { ok: true, status: 201, data: mockEvidence };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await CaseEvidencesService.create(5, body);

			expect(ApiService.post).toHaveBeenCalledTimes(1);
			expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/5/evidences', body, {});
			expect(res).toBe(mockResponse);
		});

		it('should embed the caseId correctly for different cases', async () => {
			const body: CreateCaseEvidenceBody = { filename: 'logs.tar.gz' };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 201,
				data: mockEvidence
			});

			await CaseEvidencesService.create(77, body);

			expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/77/evidences', body, {});
		});

		it('should accept a minimal body with only the required filename field', async () => {
			const body: CreateCaseEvidenceBody = { filename: 'minimal.bin' };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 201,
				data: mockEvidence
			});

			await CaseEvidencesService.create(1, body);

			expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/1/evidences', body, {});
		});

		it('should include optional chain_of_custody and custom_attributes when provided', async () => {
			const body: CreateCaseEvidenceBody = {
				filename: 'evidence.bin',
				chain_of_custody: { officer: 'Smith', badge: '1234' },
				custom_attributes: { source: 'mobile' }
			};
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 201,
				data: mockEvidence
			});

			await CaseEvidencesService.create(3, body);

			expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/3/evidences', body, {});
		});

		it('should forward custom ApiOptions to ApiService.post', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			const body: CreateCaseEvidenceBody = { filename: 'x.bin' };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 201,
				data: mockEvidence
			});

			await CaseEvidencesService.create(1, body, options);

			expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/1/evidences', body, options);
		});
	});

	// ---- update() ------------------------------------------------------------

	describe('update()', () => {
		it('should call ApiService.put with /api/v2/cases/{caseId}/evidences/{evidenceId}, body, and default options', async () => {
			const body: UpdateCaseEvidenceBody = { filename: 'renamed.dmp', file_description: 'Updated' };
			const mockResponse = {
				ok: true,
				status: 200,
				data: { ...mockEvidence, filename: 'renamed.dmp' }
			};
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await CaseEvidencesService.update(5, 10, body);

			expect(ApiService.put).toHaveBeenCalledTimes(1);
			expect(ApiService.put).toHaveBeenCalledWith('/api/v2/cases/5/evidences/10', body, {});
			expect(res).toBe(mockResponse);
		});

		it('should embed both caseId and evidenceId correctly in the URL', async () => {
			const body: UpdateCaseEvidenceBody = { file_hash: 'newHash' };
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: mockEvidence
			});

			await CaseEvidencesService.update(20, 30, body);

			expect(ApiService.put).toHaveBeenCalledWith('/api/v2/cases/20/evidences/30', body, {});
		});

		it('should accept a partial update body', async () => {
			const body: UpdateCaseEvidenceBody = { file_size: 2048 };
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: mockEvidence
			});

			await CaseEvidencesService.update(5, 10, body);

			expect(ApiService.put).toHaveBeenCalledWith('/api/v2/cases/5/evidences/10', body, {});
		});

		it('should include acquisition_date, start_date, and end_date when provided', async () => {
			const body: UpdateCaseEvidenceBody = {
				acquisition_date: '2024-02-01T00:00:00Z',
				start_date: '2024-01-01T00:00:00Z',
				end_date: '2024-01-31T23:59:59Z'
			};
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: mockEvidence
			});

			await CaseEvidencesService.update(5, 10, body);

			expect(ApiService.put).toHaveBeenCalledWith('/api/v2/cases/5/evidences/10', body, {});
		});

		it('should forward custom ApiOptions to ApiService.put', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			const body: UpdateCaseEvidenceBody = { filename: 'updated.bin' };
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: mockEvidence
			});

			await CaseEvidencesService.update(5, 10, body, options);

			expect(ApiService.put).toHaveBeenCalledWith('/api/v2/cases/5/evidences/10', body, options);
		});
	});

	// ---- remove() ------------------------------------------------------------

	describe('remove()', () => {
		it('should call ApiService.delete with /api/v2/cases/{caseId}/evidences/{evidenceId} and default options', async () => {
			const mockResponse = { ok: true, status: 204, data: null };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await CaseEvidencesService.remove(5, 10);

			expect(ApiService.delete).toHaveBeenCalledTimes(1);
			expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/5/evidences/10', {});
			expect(res).toBe(mockResponse);
		});

		it('should embed both caseId and evidenceId correctly in the URL', async () => {
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 204,
				data: null
			});

			await CaseEvidencesService.remove(100, 200);

			expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/100/evidences/200', {});
		});

		it('should forward custom ApiOptions to ApiService.delete', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 204,
				data: null
			});

			await CaseEvidencesService.remove(5, 10, options);

			expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/5/evidences/10', options);
		});
	});
});

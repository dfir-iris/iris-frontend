import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn()
	}
}));

import { DimTasksService } from '../dim-tasks.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';

describe('DimTasksService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('list()', () => {
		it('calls withQuery then get with default empty params', async () => {
			const builtPath = '/api/v2/dim-tasks';
			(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
			(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				data: { data: [], total: 0 }
			});

			await DimTasksService.list();

			expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/dim-tasks', {
				page: undefined,
				per_page: undefined,
				search: undefined,
				status: undefined
			});
			expect(ApiService.get).toHaveBeenCalledWith(builtPath, {});
		});

		it('passes page, per_page, and status params', async () => {
			const builtPath = '/api/v2/dim-tasks?page=2&per_page=25&status=FAILURE';
			(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
			(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				data: { data: [], total: 0 }
			});

			await DimTasksService.list({ page: 2, per_page: 25, status: 'FAILURE' });

			expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/dim-tasks', {
				page: 2,
				per_page: 25,
				search: undefined,
				status: 'FAILURE'
			});
		});

		it('trims whitespace-only search and omits it', async () => {
			(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
				'/api/v2/dim-tasks'
			);
			(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				data: { data: [], total: 0 }
			});

			await DimTasksService.list({ search: '   ' });

			const query = (ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
			expect(query.search).toBeUndefined();
		});

		it('includes a non-empty trimmed search string', async () => {
			(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
				'/api/v2/dim-tasks?search=celery'
			);
			(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				data: { data: [], total: 0 }
			});

			await DimTasksService.list({ search: '  celery  ' });

			const query = (ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
			// search is trimmed inside the service before passing to withQuery
			expect(query.search).toBe('celery');
		});

		it('omits empty status', async () => {
			(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
				'/api/v2/dim-tasks'
			);
			(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				data: { data: [], total: 0 }
			});

			await DimTasksService.list({ status: '' });

			const query = (ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
			expect(query.status).toBeUndefined();
		});

		it('forwards API options to ApiService.get', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
				'/api/v2/dim-tasks'
			);
			(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				data: { data: [], total: 0 }
			});

			await DimTasksService.list({}, options);

			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/dim-tasks', options);
		});
	});

	describe('get()', () => {
		it('calls ApiService.get with URL-encoded task id', async () => {
			const mockResponse = {
				ok: true,
				data: { row: { task_id: 'abc-123', state: 'SUCCESS' }, details: {} }
			};
			(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const result = await DimTasksService.get('abc-123');

			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/dim-tasks/abc-123', {});
			expect(result).toBe(mockResponse);
		});

		it('URL-encodes special characters in taskId', async () => {
			(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				data: {}
			});

			await DimTasksService.get('celery/task@worker');

			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/dim-tasks/celery%2Ftask%40worker', {});
		});

		it('forwards options', async () => {
			const options: ApiOptions = { skipAuthRedirect: true };
			(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				data: {}
			});

			await DimTasksService.get('task-id', options);

			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/dim-tasks/task-id', options);
		});
	});
});

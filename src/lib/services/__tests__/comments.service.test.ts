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

import { CommentsService } from '../comments.service';
import { ApiService } from '../api.service';

import type { ApiOptions, Paginated } from '../api.service';
import type {
	Comment,
	ListCommentsParams,
	CreateCommentBody,
	UpdateCommentBody
} from '../comments.service';

describe('CommentsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should build query and call ApiService.get with built path + options', async () => {
		const params: ListCommentsParams = {
			page: 2,
			per_page: 50
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const expectedQuery = {
			...params
		} satisfies Record<string, unknown>;

		const builtPath = '/api/v2/alerts/10/comments?page=2&per_page=50';

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				data: [{ comment_id: 1 } as unknown as Comment],
				total: 1,
				current_page: 2,
				last_page: 1,
				next_page: null
			} satisfies Paginated<Comment>
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CommentsService.list('alerts', 10, params, options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/alerts/10/comments', expectedQuery);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(builtPath, options);

		expect(res).toBe(mockResponse);
	});

	it('get() should call ApiService.get with /api/v2/{objectType}/{objectId}/comments/{commentId} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { comment_id: 5 } as unknown as Comment
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CommentsService.get('alerts', 10, 5, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/alerts/10/comments/5', options);
		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /api/v2/{objectType}/{objectId}/comments, body, options', async () => {
		const body: CreateCommentBody = {
			comment_text: 'New comment'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { comment_id: 15 } as unknown as Comment
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CommentsService.create('alerts', 10, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/api/v2/alerts/10/comments', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.put with /api/v2/{objectType}/{objectId}/comments/{commentId}, body, options', async () => {
		const body: UpdateCommentBody = {
			comment_text: 'Updated comment'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { comment_id: 5 } as unknown as Comment
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CommentsService.update('alerts', 10, 5, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/api/v2/alerts/10/comments/5', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() should call ApiService.delete with /api/v2/{objectType}/{objectId}/comments/{commentId} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CommentsService.remove('alerts', 10, 5, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/alerts/10/comments/5', options);
		expect(res).toBe(mockResponse);
	});
});

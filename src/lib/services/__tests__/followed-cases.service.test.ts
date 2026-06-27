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

import { FollowedCasesService } from '../followed-cases.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';

describe('FollowedCasesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('listMine() hits the v2 /me/followed-cases endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		const mockResponse = { ok: true, status: 200, data: [] };

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await FollowedCasesService.listMine(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/me/followed-cases', options);
		expect(res).toBe(mockResponse);
	});

	it('follow() POSTs the case_id to the v2 collection', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		const mockResponse = { ok: true, status: 201, data: { case_id: 42, followed: true } };

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await FollowedCasesService.follow(42, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith(
			'/me/followed-cases',
			{ case_id: 42 },
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('unfollow() DELETEs the v2 by-id endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		const mockResponse = { ok: true, status: 204, data: null };

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await FollowedCasesService.unfollow(42, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/me/followed-cases/42', options);
		expect(res).toBe(mockResponse);
	});

	it('listFollowers() hits the v2 cases/<id>/followers endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		const mockResponse = {
			ok: true,
			status: 200,
			data: [{ user_id: 1, user_login: 'admin', user_name: 'Administrator' }]
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await FollowedCasesService.listFollowers(42, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/cases/42/followers', options);
		expect(res).toBe(mockResponse);
	});
});

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

import { TagsService } from '../tags.service';
import { ApiService } from '../api.service';

import type { ApiOptions, Paginated } from '../api.service';
import type { Tag } from '$lib/types/resources/tag';
import type { ListTagsParams } from '../tags.service';

describe('TagsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should build query and call ApiService.get with /manage/tags/list + options', async () => {
		const params: ListTagsParams = {
			page: 2,
			per_page: 25,
			order_by: 'tag_title',
			sort_dir: 'asc',
			tag_title: 'prod'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				total: 1,
				data: [
					{
						tag_id: 5,
						tag_title: 'production'
					}
				],
				last_page: 1,
				current_page: 2,
				next_page: null
			} satisfies Paginated<Tag>
		};

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			'/manage/tags/list?page=2&per_page=25&order_by=tag_title&sort_dir=asc&tag_title=prod'
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await TagsService.list(params, options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith('/manage/tags/list', params);
		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(
			'/manage/tags/list?page=2&per_page=25&order_by=tag_title&sort_dir=asc&tag_title=prod',
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('suggestions() should return empty array for blank search term and not call ApiService', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const res = await TagsService.suggestions('   ', options);

		expect(ApiService.withQuery).not.toHaveBeenCalled();
		expect(ApiService.get).not.toHaveBeenCalled();
		expect(res).toEqual([]);
	});

	it('suggestions() should search tags and return paginated data items', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const tags: Tag[] = [
			{
				tag_id: 5,
				tag_title: 'production'
			}
		];

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				total: 1,
				data: tags,
				last_page: 1,
				current_page: 1,
				next_page: null
			} satisfies Paginated<Tag>
		};

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			'/manage/tags/list?page=1&per_page=10&order_by=tag_title&sort_dir=asc&tag_title=prod'
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await TagsService.suggestions(' prod ', options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith('/manage/tags/list', {
			page: 1,
			per_page: 10,
			order_by: 'tag_title',
			sort_dir: 'asc',
			tag_title: 'prod'
		});
		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(res).toBe(tags);
	});

	it('suggestions() should return empty array when response is not ok', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: false,
			status: 500,
			data: null
		};

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			'/manage/tags/list?page=1&per_page=10&order_by=tag_title&sort_dir=asc&tag_title=prod'
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await TagsService.suggestions('prod', options);

		expect(res).toEqual([]);
	});
});

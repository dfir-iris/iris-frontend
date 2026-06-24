import { ApiService } from './api.service';
import type { ApiOptions, Paginated, RequestResponse } from './api.service';
import type { Tag } from '$lib/types/resources/tag';

export interface ListTagsParams {
	page?: number;
	per_page?: number;
	order_by?: string;
	sort_dir?: 'asc' | 'desc';
	tag_title?: string;
}

export class TagsService {
	static async list(
		params: ListTagsParams = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<Paginated<Tag>>> {
		// v2 tags live at `/api/v2/tags` (NOT under /manage/). Same
		// paginated envelope + `tag_title` ILIKE filter as the legacy
		// `/manage/tags/list`, so consumers don't need to change.
		const path = ApiService.withQuery('/tags', params as Record<string, unknown>);

		return ApiService.get<Paginated<Tag>>(path, options);
	}

	static async suggestions(searchTerm: string, options: ApiOptions = {}): Promise<Tag[]> {
		if (!searchTerm.trim()) return [];

		const res = await TagsService.list(
			{
				page: 1,
				per_page: 10,
				order_by: 'tag_title',
				sort_dir: 'asc',
				tag_title: searchTerm.trim()
			},
			options
		);

		if (!res.ok || !res.data || typeof res.data === 'string') return [];

		return res.data.data;
	}
}

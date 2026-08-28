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

import { CaseClassificationsService } from '../case-classifications.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';
import type {
	CaseClassification,
	CreateCaseClassificationBody,
	UpdateCaseClassificationBody
} from '../case-classifications.service';

describe('CaseClassificationsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() hits the v2 case-objects classifications endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: [
				{
					id: 1,
					name: 'name',
					name_expanded: 'name expanded',
					description: 'desc',
					creation_date: '2026-02-06T00:00:00Z'
				}
			] satisfies CaseClassification[]
		};

		const urlWithQuery = '/manage/case-objects/case-classifications?per_page=10000';
		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(urlWithQuery);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseClassificationsService.list(options);

		expect(ApiService.withQuery).toHaveBeenCalledWith('/manage/case-objects/case-classifications', {
			per_page: 10000
		});
		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(urlWithQuery, options);
		expect(res).toBe(mockResponse);
	});

	it('get() hits the v2 by-id endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				id: 7,
				name: 'name',
				name_expanded: 'name expanded',
				description: 'desc',
				creation_date: '2026-02-06T00:00:00Z'
			} satisfies CaseClassification
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseClassificationsService.get(7, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(
			'/manage/case-objects/case-classifications/7',
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('create() POSTs to the v2 collection', async () => {
		const body: CreateCaseClassificationBody = {
			name: 'name',
			name_expanded: 'name expanded',
			description: 'desc'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 201,
			data: {
				id: 101,
				name: 'name',
				name_expanded: 'name expanded',
				description: 'desc',
				creation_date: '2026-02-06T00:00:00Z'
			} satisfies CaseClassification
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseClassificationsService.create(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/case-objects/case-classifications',
			body,
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('update() PUTs to the v2 by-id endpoint', async () => {
		const body: UpdateCaseClassificationBody = {
			name_expanded: 'new expanded'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				id: 7,
				name: 'name',
				name_expanded: 'new expanded',
				description: 'desc',
				creation_date: '2026-02-06T00:00:00Z'
			} satisfies CaseClassification
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseClassificationsService.update(7, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith(
			'/manage/case-objects/case-classifications/7',
			body,
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('remove() DELETEs the v2 by-id endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseClassificationsService.remove(7, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith(
			'/manage/case-objects/case-classifications/7',
			options
		);
		expect(res).toBe(mockResponse);
	});
});

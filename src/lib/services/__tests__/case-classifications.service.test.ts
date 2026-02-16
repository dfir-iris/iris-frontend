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

	it('list() should call ApiService.get with /manage/case-classifications/list + options', async () => {
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

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseClassificationsService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/case-classifications/list', options);
		expect(res).toBe(mockResponse);
	});

	it('get() should call ApiService.get with /manage/case-classifications/{id} + options', async () => {
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
		expect(ApiService.get).toHaveBeenCalledWith('/manage/case-classifications/7', options);
		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /manage/case-classifications/add, body, options', async () => {
		const body: CreateCaseClassificationBody = {
			name: 'name',
			name_expanded: 'name expanded',
			description: 'desc'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
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
		expect(ApiService.post).toHaveBeenCalledWith('/manage/case-classifications/add', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.post with /manage/case-classifications/update/{id}, body, options', async () => {
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

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseClassificationsService.update(7, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/case-classifications/update/7',
			body,
			options
		);
		expect(res).toBe(mockResponse);
	});

	it('remove() should call ApiService.post with /manage/case-classifications/delete/{id}, empty body, options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseClassificationsService.remove(7, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith(
			'/manage/case-classifications/delete/7',
			{},
			options
		);
		expect(res).toBe(mockResponse);
	});
});

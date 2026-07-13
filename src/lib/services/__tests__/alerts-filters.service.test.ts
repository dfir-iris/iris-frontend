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

import { AlertsFiltersService } from '../alerts-filters.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type {
	CreateSavedFilterBody,
	ListSavedFiltersParams,
	SavedFilter
} from '../alerts-filters.service';

describe('AlertsFiltersService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should call ApiService.withQuery(/api/v2/alerts/filters, query) and ApiService.get with built path + options', async () => {
		const params: ListSavedFiltersParams = {
			filter_type: 'alerts',
			include_public: 1
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const expectedQuery = {
			filter_type: 'alerts',
			include_public: 1
		} satisfies Record<string, unknown>;

		const builtPath = '/api/v2/alerts/filters?filter_type=alerts&include_public=1';

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);

		const mockResponse = {
			ok: true,
			status: 200,
			data: [
				{
					filter_id: 1,
					filter_is_private: true,
					filter_type: 'alerts',
					filter_name: 'My filter',
					filter_description: 'desc',
					filter_data: {}
				}
			] as unknown as SavedFilter[]
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertsFiltersService.list(params, options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/alerts/filters', expectedQuery);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(builtPath, options);

		expect(res).toBe(mockResponse);
	});

	it('list() should default filter_type=alerts and include_public=1 when params omitted', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const expectedQuery = {
			filter_type: 'alerts',
			include_public: 1
		} satisfies Record<string, unknown>;

		const builtPath = '/api/v2/alerts/filters?filter_type=alerts&include_public=1';

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);

		const mockResponse = {
			ok: true,
			status: 200,
			data: []
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertsFiltersService.list({}, options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/alerts/filters', expectedQuery);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(builtPath, options);

		expect(res).toBe(mockResponse);
	});

	it('get() should call ApiService.get with /api/v2/alerts/filters/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				filter_id: 10,
				filter_is_private: true,
				filter_type: 'alerts',
				filter_name: 'F',
				filter_description: '',
				filter_data: {}
			} as unknown as SavedFilter
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertsFiltersService.get(10, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/alerts/filters/10', options);

		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /api/v2/alerts/filters, body, options', async () => {
		const body: CreateSavedFilterBody = {
			filter_is_private: true,
			filter_type: 'alerts',
			filter_name: 'My filter',
			filter_description: 'desc',
			filter_data: { alert_title: 'x' }
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 201,
			data: { filter_id: 123 } as unknown as SavedFilter
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertsFiltersService.create(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/api/v2/alerts/filters', body, options);

		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.put with /api/v2/alerts/filters/{id}, body, options', async () => {
		const body: Partial<CreateSavedFilterBody> = {
			filter_name: 'Updated name'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { filter_id: 10 } as unknown as SavedFilter
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertsFiltersService.update(10, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/api/v2/alerts/filters/10', body, options);

		expect(res).toBe(mockResponse);
	});

	it('remove() should call ApiService.delete with /api/v2/alerts/filters/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertsFiltersService.remove(10, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/alerts/filters/10', options);

		expect(res).toBe(mockResponse);
	});
});

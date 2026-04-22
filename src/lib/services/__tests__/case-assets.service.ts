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

import { CaseAssetsService } from '../case-assets.service';
import { ApiService } from '../api.service';

import type { ApiOptions, Paginated } from '../api.service';
import type { Asset } from '$lib/types/resources/asset';
import type {
	CreateCaseAssetBody,
	UpdateCaseAssetBody,
	ListCaseAssetsParams
} from '../case-assets.service';

describe('CaseAssetsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should build query and call ApiService.get with built path + options', async () => {
		const params: ListCaseAssetsParams = {
			page: 2,
			per_page: 25,
			order_by: 'asset_name',
			sort_dir: 'asc'
		};

		const options: ApiOptions = { skipTokenRefresh: true };
		const builtPath = '/api/v2/cases/73/assets?page=2&per_page=25&order_by=asset_name&sort_dir=asc';

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				total: 1,
				data: [
					{
						asset_id: 11,
						asset_name: 'DC01',
						asset_type_id: 9
					} as Asset
				],
				last_page: 1,
				current_page: 2,
				next_page: null
			} satisfies Paginated<Asset>
		};

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseAssetsService.list(73, params, options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/cases/73/assets', params);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(builtPath, options);

		expect(res).toBe(mockResponse);
	});

	it('get() should call ApiService.get with /api/v2/cases/{caseId}/assets/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				asset_id: 11,
				asset_name: 'DC01',
				asset_type_id: 9
			} as Asset
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseAssetsService.get(73, 11, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/73/assets/11', options);
		expect(res).toBe(mockResponse);
	});

	it('getById() should call ApiService.get with /api/v2/assets/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				asset_id: 11,
				asset_name: 'DC01',
				asset_type_id: 9
			} as Asset
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseAssetsService.getById(11, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/assets/11', options);
		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /api/v2/cases/{caseId}/assets, body, options', async () => {
		const body: CreateCaseAssetBody = {
			asset_name: 'DC01',
			asset_type_id: 9,
			asset_description: 'Domain controller',
			asset_ip: '10.0.0.1',
			asset_domain: 'corp.local',
			asset_tags: 'infra',
			asset_compromise_status_id: 1,
			analysis_status_id: 2
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 201,
			data: {
				asset_id: 11,
				asset_name: 'DC01',
				asset_type_id: 9
			} as Asset
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseAssetsService.create(73, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/73/assets', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.put with /api/v2/cases/{caseId}/assets/{id}, body, options', async () => {
		const body: UpdateCaseAssetBody = {
			asset_name: 'DC01-Renamed',
			asset_type_id: 11,
			asset_description: 'Updated description',
			asset_ip: '10.0.0.2',
			asset_domain: 'ad.corp.local',
			asset_info: 'Updated info',
			asset_tags: 'infra,critical',
			asset_compromise_status_id: 1,
			analysis_status_id: 3,
			ioc_links: ['30', '31'],
			custom_attributes: {}
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				asset_id: 11,
				asset_name: 'DC01-Renamed',
				asset_type_id: 11
			} as Asset
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseAssetsService.update(73, 11, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/api/v2/cases/73/assets/11', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() should call ApiService.delete with /api/v2/cases/{caseId}/assets/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseAssetsService.remove(73, 11, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/73/assets/11', options);
		expect(res).toBe(mockResponse);
	});
});

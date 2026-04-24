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

import { AssetTypesService } from '../asset-types.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type { AssetType } from '../asset-types.service';

describe('AssetTypesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should build query and return unwrapped asset types', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const items: AssetType[] = [
			{
				asset_id: 1,
				asset_name: 'Firewall',
				asset_description: 'Firewall asset'
			},
			{
				asset_id: 2,
				asset_name: 'Windows - Server',
				asset_description: 'Server asset'
			}
		];

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				data: items,
				message: 'ok',
				status: 'success'
			}
		};

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			'/manage/asset-type/list?cid=73'
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AssetTypesService.list(73, options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith('/manage/asset-type/list', {
			cid: 73
		});
		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/asset-type/list?cid=73', options);
		expect(res.data).toBe(items);
	});

	it('list() should return empty array when response data is invalid', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: false,
			status: 500,
			data: null
		};

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			'/manage/asset-type/list?cid=73'
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AssetTypesService.list(73, options);

		expect(res.data).toEqual([]);
	});

	it('get() should call ApiService.get with /manage/asset-type/{id} and return unwrapped asset type', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const item: AssetType = {
			asset_id: 1,
			asset_name: 'Firewall',
			asset_description: 'Firewall asset'
		};

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				data: item,
				message: 'ok',
				status: 'success'
			}
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AssetTypesService.get(1, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/asset-type/1', options);
		expect(res.data).toBe(item);
	});

	it('get() should return null when response data is invalid', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: false,
			status: 404,
			data: null
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AssetTypesService.get(1, options);

		expect(res.data).toBeNull();
	});
});

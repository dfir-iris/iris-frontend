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

	it('list() hits the case-agnostic v2 endpoint and unwraps the envelope', async () => {
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

		// v2 paginated envelope shares `data: T[]` with the legacy
		// `{status, message, data}` envelope, so a single unwrap
		// inside the service covers both shapes.
		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				data: items
			}
		};

		const urlWithQuery = '/manage/case-objects/asset-types?per_page=10000';
		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(urlWithQuery);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AssetTypesService.list(73, options);

		// `caseId` argument is accepted but ignored on v2 — the
		// legacy `cid` query param is gone. `per_page=10000` overrides
		// the v2 default of 10 so the asset-type dropdown surfaces
		// every type rather than silently truncating to ten.
		expect(ApiService.withQuery).toHaveBeenCalledWith('/manage/case-objects/asset-types', {
			per_page: 10000
		});
		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(urlWithQuery, options);
		expect(res.data).toBe(items);
	});

	it('list() returns empty array when response data is invalid', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: false,
			status: 500,
			data: null
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AssetTypesService.list(73, options);

		expect(res.data).toEqual([]);
	});

	it('get() hits the v2 by-id endpoint and returns the row directly', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const item: AssetType = {
			asset_id: 1,
			asset_name: 'Firewall',
			asset_description: 'Firewall asset'
		};

		// v2 returns the row directly (not wrapped in `{data: ...}`
		// like the legacy envelope).
		const mockResponse = {
			ok: true,
			status: 200,
			data: item
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AssetTypesService.get(1, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/case-objects/asset-types/1', options);
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

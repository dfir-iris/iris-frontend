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

import { IocTypesService } from '../ioc-types.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';
import type { IocType } from '../ioc-types.service';

describe('IocTypesService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should request all entries (per_page=10000) and unwrap data', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const data: IocType[] = [{ type_id: 1, type_name: 'ip-src' }];

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				status: 'success',
				message: '',
				data
			}
		};

		const urlWithQuery = '/manage/case-objects/ioc-types?per_page=10000';
		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			urlWithQuery
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await IocTypesService.list(options);

		// `per_page=10000` is the explicit "give me everything" signal —
		// the v2 backend's per_page=10 default silently truncates IOC
		// type dropdowns to the first ten entries.
		expect(ApiService.withQuery).toHaveBeenCalledWith(
			'/manage/case-objects/ioc-types',
			{ per_page: 10000 }
		);
		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(urlWithQuery, options);
		expect(res).toEqual({
			...mockResponse,
			data
		});
	});
});

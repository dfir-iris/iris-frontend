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

	it('list() should call ApiService.get with /manage/ioc-types/list + options and unwrap data', async () => {
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

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await IocTypesService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/ioc-types/list', options);
		expect(res).toEqual({
			...mockResponse,
			data
		});
	});
});

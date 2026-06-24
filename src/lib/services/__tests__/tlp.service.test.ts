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

import { TlpService } from '../tlp.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';
import type { TlpItem } from '../tlp.service';

describe('TlpService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should call ApiService.get with /manage/tlp/list + options and unwrap data', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const data: TlpItem[] = [{ tlp_id: 2, tlp_name: 'amber' }];

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

		const res = await TlpService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/tlp', options);
		expect(res).toEqual({
			...mockResponse,
			data
		});
	});
});

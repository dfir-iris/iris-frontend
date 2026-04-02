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

import { HooksService } from '../hooks.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type { CallHookBody, HookOption, ListHooksResponse } from '../hooks.service';

describe('HooksService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should call ApiService.get with /dim/hooks/options/{objectType}/list + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				status: 'success',
				message: '',
				data: [
					{
						hook_name: 'test_hook',
						manual_hook_ui_name: 'Test Hook',
						module_name: 'test_module'
					} as HookOption
				]
			} satisfies ListHooksResponse
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await HooksService.list('case', options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/dim/hooks/options/case/list', options);
		expect(res).toBe(mockResponse);
	});

	it('call() should call ApiService.post with /dim/hooks/call, body, options', async () => {
		const body: CallHookBody = {
			hook_name: 'test_hook',
			module_name: 'test_module',
			hook_ui_name: 'Test Hook',
			type: 'case',
			targets: [10, 20]
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: null
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await HooksService.call(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/dim/hooks/call', body, options);
		expect(res).toBe(mockResponse);
	});
});

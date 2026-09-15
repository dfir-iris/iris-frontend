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
import type { HookOption, InvokeAlertHookBody, InvokeHookBody } from '../hooks.service';

describe('HooksService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() calls ApiService.get with /dim-hooks?target=<type> and forwards options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: [
				{
					hook_name: 'on_manual_trigger_case',
					manual_hook_ui_name: 'Test Hook',
					module_name: 'test_module'
				} as HookOption
			]
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await HooksService.list('case', options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/dim-hooks?target=case', options);
		expect(res).toBe(mockResponse);
	});

	it('list() URL-encodes the target query parameter', async () => {
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: []
		});

		await HooksService.list('global_task');

		expect(ApiService.get).toHaveBeenCalledWith('/dim-hooks?target=global_task', {});
	});

	it('invoke() calls ApiService.post with /cases/{caseId}/dim-hooks/invoke, body, options', async () => {
		const body: InvokeHookBody = {
			hook_name: 'on_manual_trigger_case',
			module_name: 'test_module',
			hook_ui_name: 'Test Hook',
			type: 'case',
			targets: [10, 20]
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { queued: 2 }
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await HooksService.invoke(42, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/cases/42/dim-hooks/invoke', body, options);
		expect(res).toBe(mockResponse);
	});

	it('invokeForAlerts() calls ApiService.post with /alerts/dim-hooks/invoke, body, options', async () => {
		const body: InvokeAlertHookBody = {
			hook_name: 'on_manual_trigger_alert',
			module_name: 'test_module',
			hook_ui_name: 'Test Hook',
			targets: [10, 20]
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { queued: 2 }
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await HooksService.invokeForAlerts(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/alerts/dim-hooks/invoke', body, options);
		expect(res).toBe(mockResponse);
	});
});

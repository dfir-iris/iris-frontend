import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { ServerSettingsService } from '../server-settings.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';

describe('ServerSettingsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('get() hits the v2 settings endpoint and returns the settings + versions block', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				settings: {
					http_proxy: null,
					https_proxy: null,
					prevent_post_mod_repush: false,
					prevent_post_objects_repush: false,
					has_updates_available: false,
					enable_updates_check: true,
					password_policy_min_length: 12,
					password_policy_upper_case: true,
					password_policy_lower_case: true,
					password_policy_digit: true,
					password_policy_special_chars: '',
					enforce_mfa: false,
					force_confirmation_before_delete: true
				},
				versions: {
					iris_version: 'v2.5.0',
					api_min: '2.0.0',
					api_max: '2.1.0',
					module_interface_min: '1.1',
					module_interface_max: '1.2.0',
					db_revision: 'abcdef123'
				}
			}
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await ServerSettingsService.get(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/server/settings', options);
		expect(res).toBe(mockResponse);
	});

	it('update() PUTs a partial body to the v2 endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		// Only the fields the admin actually changed need to be sent;
		// the backend's `partial=True` load picks them up and leaves
		// the rest of the row alone.
		const body = { enforce_mfa: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				enforce_mfa: true
			}
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await ServerSettingsService.update(body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/manage/server/settings', body, options);
		expect(res).toBe(mockResponse);
	});

	it('backupDb() POSTs the v2 backup trigger', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { logs: ['ok'] }
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await ServerSettingsService.backupDb(options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/server/backups/db', {}, options);
		expect(res).toBe(mockResponse);
	});
});

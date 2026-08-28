import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn()
	}
}));

import { ProfileService } from '../profile.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type {
	Profile,
	ProfileUpdateBody,
	UserApiKey,
	UserApiKeyList,
	UserApiKeyCreated,
	UserApiKeyCreateBody
} from '../profile.service';

const mockProfile: Profile = {
	user_id: 1,
	uuid: 'uuid-abc',
	user_name: 'Test User',
	user_login: 'testuser',
	user_email: 'testuser@example.com',
	user_api_key: 'key-123',
	user_isadmin: false,
	user_is_service_account: false,
	user_active: true,
	in_dark_mode: false,
	has_mini_sidebar: false,
	has_deletion_confirmation: true
};

const mockApiKey: UserApiKey = {
	id: 42,
	user_id: 1,
	name: 'My CI key',
	scope_mask: null,
	created_at: '2024-01-01T00:00:00Z',
	last_used_at: null,
	revoked_at: null
};

describe('ProfileService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ---- get() ---------------------------------------------------------------

	describe('get()', () => {
		it('should call ApiService.get with /me and default options', async () => {
			const mockResponse = { ok: true, status: 200, data: mockProfile };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await ProfileService.get();

			expect(ApiService.get).toHaveBeenCalledTimes(1);
			expect(ApiService.get).toHaveBeenCalledWith('/me', {});
			expect(res).toBe(mockResponse);
		});

		it('should forward custom ApiOptions to ApiService.get', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			const mockResponse = { ok: true, status: 200, data: mockProfile };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			await ProfileService.get(options);

			expect(ApiService.get).toHaveBeenCalledWith('/me', options);
		});
	});

	// ---- update() ------------------------------------------------------------

	describe('update()', () => {
		it('should call ApiService.put with /me, body, and default options', async () => {
			const body: ProfileUpdateBody = { user_name: 'New Name', in_dark_mode: true };
			const mockResponse = { ok: true, status: 200, data: { ...mockProfile, user_name: 'New Name' } };
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await ProfileService.update(body);

			expect(ApiService.put).toHaveBeenCalledTimes(1);
			expect(ApiService.put).toHaveBeenCalledWith('/me', body, {});
			expect(res).toBe(mockResponse);
		});

		it('should pass all writable profile fields in the body', async () => {
			const body: ProfileUpdateBody = {
				user_name: 'Changed',
				user_login: 'changed_login',
				user_email: 'changed@example.com',
				user_password: 'newpass',
				user_current_password: 'oldpass',
				in_dark_mode: true,
				has_mini_sidebar: true,
				has_deletion_confirmation: false
			};
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockProfile });

			await ProfileService.update(body);

			expect(ApiService.put).toHaveBeenCalledWith('/me', body, {});
		});

		it('should forward custom ApiOptions to ApiService.put', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			const body: ProfileUpdateBody = { has_mini_sidebar: true };
			(ApiService.put as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockProfile });

			await ProfileService.update(body, options);

			expect(ApiService.put).toHaveBeenCalledWith('/me', body, options);
		});
	});

	// ---- renewApiKey() -------------------------------------------------------

	describe('renewApiKey()', () => {
		it('should call ApiService.post with /me/api-key/renew, empty body, and default options', async () => {
			const mockResponse = { ok: true, status: 200, data: { ...mockProfile, user_api_key: 'new-key' } };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await ProfileService.renewApiKey();

			expect(ApiService.post).toHaveBeenCalledTimes(1);
			expect(ApiService.post).toHaveBeenCalledWith('/me/api-key/renew', {}, {});
			expect(res).toBe(mockResponse);
		});

		it('should forward custom ApiOptions to ApiService.post', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockProfile });

			await ProfileService.renewApiKey(options);

			expect(ApiService.post).toHaveBeenCalledWith('/me/api-key/renew', {}, options);
		});
	});

	// ---- refreshPermissions() ------------------------------------------------

	describe('refreshPermissions()', () => {
		it('should call ApiService.post with /me/permissions/refresh, empty body, and default options', async () => {
			const mockResponse = { ok: true, status: 200, data: mockProfile };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await ProfileService.refreshPermissions();

			expect(ApiService.post).toHaveBeenCalledTimes(1);
			expect(ApiService.post).toHaveBeenCalledWith('/me/permissions/refresh', {}, {});
			expect(res).toBe(mockResponse);
		});

		it('should forward custom ApiOptions to ApiService.post', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockProfile });

			await ProfileService.refreshPermissions(options);

			expect(ApiService.post).toHaveBeenCalledWith('/me/permissions/refresh', {}, options);
		});
	});

	// ---- listApiKeys() -------------------------------------------------------

	describe('listApiKeys()', () => {
		it('should call ApiService.get with /me/api-keys and default options', async () => {
			const mockResponse = {
				ok: true,
				status: 200,
				data: { api_keys: [mockApiKey] } satisfies UserApiKeyList
			};
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await ProfileService.listApiKeys();

			expect(ApiService.get).toHaveBeenCalledTimes(1);
			expect(ApiService.get).toHaveBeenCalledWith('/me/api-keys', {});
			expect(res).toBe(mockResponse);
		});

		it('should forward custom ApiOptions to ApiService.get', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			(ApiService.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 200,
				data: { api_keys: [] }
			});

			await ProfileService.listApiKeys(options);

			expect(ApiService.get).toHaveBeenCalledWith('/me/api-keys', options);
		});
	});

	// ---- createApiKey() ------------------------------------------------------

	describe('createApiKey()', () => {
		it('should call ApiService.post with /me/api-keys, body, and default options', async () => {
			const body: UserApiKeyCreateBody = { name: 'CI runner' };
			const mockCreated: UserApiKeyCreated = { ...mockApiKey, api_key: 'plaintext-key-once' };
			const mockResponse = { ok: true, status: 201, data: mockCreated };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await ProfileService.createApiKey(body);

			expect(ApiService.post).toHaveBeenCalledTimes(1);
			expect(ApiService.post).toHaveBeenCalledWith('/me/api-keys', body, {});
			expect(res).toBe(mockResponse);
		});

		it('should include scope_mask when provided', async () => {
			const body: UserApiKeyCreateBody = { name: 'Scoped key', scope_mask: 0b0011 };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
				ok: true,
				status: 201,
				data: { ...mockApiKey, scope_mask: 0b0011, api_key: 'scoped-key' }
			});

			await ProfileService.createApiKey(body);

			expect(ApiService.post).toHaveBeenCalledWith('/me/api-keys', body, {});
		});

		it('should forward custom ApiOptions to ApiService.post', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			const body: UserApiKeyCreateBody = { name: 'Test key' };
			(ApiService.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 201, data: { ...mockApiKey, api_key: 'k' } });

			await ProfileService.createApiKey(body, options);

			expect(ApiService.post).toHaveBeenCalledWith('/me/api-keys', body, options);
		});
	});

	// ---- revokeApiKey() ------------------------------------------------------

	describe('revokeApiKey()', () => {
		it('should call ApiService.delete with /me/api-keys/{keyId} and default options', async () => {
			const mockResponse = { ok: true, status: 200, data: { ...mockApiKey, revoked_at: '2024-06-01T00:00:00Z' } };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

			const res = await ProfileService.revokeApiKey(42);

			expect(ApiService.delete).toHaveBeenCalledTimes(1);
			expect(ApiService.delete).toHaveBeenCalledWith('/me/api-keys/42', {});
			expect(res).toBe(mockResponse);
		});

		it('should embed the keyId correctly in the URL for different ids', async () => {
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockApiKey });

			await ProfileService.revokeApiKey(999);

			expect(ApiService.delete).toHaveBeenCalledWith('/me/api-keys/999', {});
		});

		it('should forward custom ApiOptions to ApiService.delete', async () => {
			const options: ApiOptions = { skipTokenRefresh: true };
			(ApiService.delete as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, status: 200, data: mockApiKey });

			await ProfileService.revokeApiKey(42, options);

			expect(ApiService.delete).toHaveBeenCalledWith('/me/api-keys/42', options);
		});
	});
});

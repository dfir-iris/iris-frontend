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

import { UsersService } from '../users.service';
import { ApiService } from '../api.service';

import type { ApiOptions } from '../api.service';
import type { User, CreateUserBody, UpdateUserBody } from '../users.service';

describe('UsersService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should call ApiService.get with /manage/users/list + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: [
				{
					id: 1,
					user_id: 1,
					user_login: 'jdoe',
					user_name: 'John Doe',
					user_email: 'john@example.com',
					uuid: 'uuid-1',
					active: true,
					user_is_service_account: false,
					has_deletion_confirmation: true,
					has_mini_sidebar: false,
					user_api_key: 'api-key-1',
					in_dark_mode: null,
					external_id: null
				}
			] satisfies User[]
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await UsersService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/users/list', options);
		expect(res).toBe(mockResponse);
	});

	it('get() should call ApiService.get with /manage/users/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				id: 7,
				user_id: 7,
				user_login: 'asmith',
				user_name: 'Alice Smith',
				user_email: 'alice@example.com',
				uuid: 'uuid-7',
				active: true,
				user_is_service_account: false,
				has_deletion_confirmation: false,
				has_mini_sidebar: true,
				user_api_key: 'api-key-7',
				in_dark_mode: true,
				external_id: 'ext-7'
			} satisfies User
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await UsersService.get(7, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/users/7', options);
		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /manage/users/add, body, options', async () => {
		const body: CreateUserBody = {
			user_name: 'New User',
			user_login: 'newuser',
			user_email: 'newuser@example.com',
			user_password: 'secret'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				id: 101,
				user_id: 101,
				user_login: 'newuser',
				user_name: 'New User',
				user_email: 'newuser@example.com',
				uuid: 'uuid-101',
				active: true,
				user_is_service_account: false,
				has_deletion_confirmation: false,
				has_mini_sidebar: false,
				user_api_key: 'api-key-101',
				in_dark_mode: null,
				external_id: null
			} satisfies User
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await UsersService.create(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/users/add', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.post with /manage/users/update/{id}, body, options', async () => {
		const body: UpdateUserBody = {
			user_email: 'updated@example.com'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				id: 7,
				user_id: 7,
				user_login: 'asmith',
				user_name: 'Alice Smith',
				user_email: 'updated@example.com',
				uuid: 'uuid-7',
				active: true,
				user_is_service_account: false,
				has_deletion_confirmation: false,
				has_mini_sidebar: true,
				user_api_key: 'api-key-7',
				in_dark_mode: true,
				external_id: 'ext-7'
			} satisfies User
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await UsersService.update(7, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/users/update/7', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() should call ApiService.post with /manage/users/delete/{id}, empty body, options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await UsersService.remove(7, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/users/delete/7', {}, options);
		expect(res).toBe(mockResponse);
	});
});

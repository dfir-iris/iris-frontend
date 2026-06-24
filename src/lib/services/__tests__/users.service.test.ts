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

	it('list() hits the v2 paginated users endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				total: 1,
				current_page: 1,
				last_page: 1,
				next_page: null,
				data: [
					{
						user_id: 1,
						user_login: 'jdoe',
						user_name: 'John Doe',
						user_email: 'john@example.com',
						user_active: true,
						user_is_service_account: false,
						user_isadmin: false
					}
				] satisfies User[]
			}
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await UsersService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/users?per_page=200', options);
		expect(res).toBe(mockResponse);
	});

	it('get() hits /manage/users/{id} on v2', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				user_id: 7,
				user_login: 'asmith',
				user_name: 'Alice Smith',
				user_email: 'alice@example.com',
				user_active: true,
				user_is_service_account: false,
				user_isadmin: false
			} satisfies User
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await UsersService.get(7, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/users/7', options);
		expect(res).toBe(mockResponse);
	});

	it('create() POSTs to /manage/users on v2', async () => {
		const body: CreateUserBody = {
			user_name: 'New User',
			user_login: 'newuser',
			user_email: 'newuser@example.com',
			user_password: 'secret'
		};
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 201,
			data: {
				user_id: 101,
				user_login: 'newuser',
				user_name: 'New User',
				user_email: 'newuser@example.com',
				user_active: true
			} satisfies User
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await UsersService.create(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/users', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() PUTs to /manage/users/{id} on v2', async () => {
		const body: UpdateUserBody = {
			user_email: 'updated@example.com'
		};
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				user_id: 7,
				user_login: 'asmith',
				user_name: 'Alice Smith',
				user_email: 'updated@example.com',
				user_active: true
			} satisfies User
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await UsersService.update(7, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/manage/users/7', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() DELETEs /manage/users/{id} on v2', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await UsersService.remove(7, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/manage/users/7', options);
		expect(res).toBe(mockResponse);
	});
});

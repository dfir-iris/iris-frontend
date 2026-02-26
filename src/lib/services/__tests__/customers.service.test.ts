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

import { CustomersService } from '../customers.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';
import type { Customer, CustomerBody } from '../customers.service';

describe('CustomersService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should call ApiService.get with /manage/customers/list + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: [
				{
					customer_id: 1,
					customer_name: 'ACME',
					customer_description: 'desc',
					customer_sla: 'SLA',
					customer_uuid: 'uuid-1',
					custom_attributes: { tier: 'gold' }
				}
			] satisfies Customer[]
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CustomersService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/customers', options);
		expect(res).toBe(mockResponse);
	});

	it('get() should call ApiService.get with /manage/customers/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				customer_id: 7,
				customer_name: 'Umbrella',
				customer_description: null,
				customer_sla: null,
				customer_uuid: 'uuid-7',
				contacts: [],
				custom_attributes: null
			} satisfies Customer
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CustomersService.get(7, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/customers/7', options);
		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /manage/customers/add, body, options', async () => {
		const body: CustomerBody = {
			customer_name: 'New Customer',
			customer_description: 'desc',
			customer_sla: 'SLA',
			custom_attributes: { tier: 'silver' }
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				customer_id: 101,
				customer_name: 'New Customer',
				customer_description: 'desc',
				customer_sla: 'SLA',
				customer_uuid: 'uuid-101',
				custom_attributes: { tier: 'silver' }
			} satisfies Customer
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CustomersService.create(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/customers/add', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.post with /manage/customers/update/{id}, body, options', async () => {
		const body: CustomerBody = {
			customer_description: 'Updated description'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				customer_id: 7,
				customer_name: 'Umbrella',
				customer_description: 'Updated description',
				customer_sla: null,
				customer_uuid: 'uuid-7',
				custom_attributes: null
			} satisfies Customer
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CustomersService.update(7, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/customers/update/7', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() should call ApiService.post with /manage/customers/delete/{id}, empty body, options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CustomersService.remove(7, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/manage/customers/delete/7', {}, options);
		expect(res).toBe(mockResponse);
	});
});

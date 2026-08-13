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

	const makeCustomer = (id: number): Customer => ({
		customer_id: id,
		customer_name: `Customer ${id}`,
		customer_description: 'desc',
		customer_sla: 'SLA',
		customer_uuid: `uuid-${id}`,
		custom_attributes: null
	});

	it('list() unwraps the v2 paginated envelope into a flat array', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };
		const customers = [makeCustomer(1)];

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			'/manage/customers?per_page=10000'
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { total: 1, data: customers, last_page: 1, current_page: 1, next_page: null }
		});

		const res = await CustomersService.list(options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/manage/customers?per_page=10000', options);
		expect(res.data).toEqual(customers);
	});

	it('list() asks for a per_page large enough not to truncate at the v2 default of 10', async () => {
		const customers = Array.from({ length: 25 }, (_, i) => makeCustomer(i + 1));

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockImplementation(
			(path: string) => path
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: true,
			status: 200,
			data: { total: 25, data: customers, last_page: 1, current_page: 1, next_page: null }
		});

		const res = await CustomersService.list();

		expect(ApiService.withQuery).toHaveBeenCalledWith('/manage/customers', { per_page: 10000 });
		expect(res.data).toHaveLength(25);
	});

	it('list() degrades to an empty array when the request fails', async () => {
		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			'/manage/customers?per_page=10000'
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
			ok: false,
			status: 403,
			data: 'Forbidden'
		});

		const res = await CustomersService.list();

		expect(res.data).toEqual([]);
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
		expect(ApiService.post).toHaveBeenCalledWith('/manage/customers', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() PUTs to the v2 by-id endpoint', async () => {
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

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CustomersService.update(7, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/manage/customers/7', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() DELETEs the v2 by-id endpoint', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CustomersService.remove(7, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/manage/customers/7', options);
		expect(res).toBe(mockResponse);
	});
});

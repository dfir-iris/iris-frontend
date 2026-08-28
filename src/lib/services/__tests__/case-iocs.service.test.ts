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

import { CaseIocsService } from '../case-iocs.service';
import { ApiService } from '../api.service';

import type { ApiOptions, Paginated } from '../api.service';
import type { Ioc } from '$lib/types/resources/ioc';
import type {
	CreateCaseIocBody,
	UpdateCaseIocBody,
	ListCaseIocsParams
} from '../case-iocs.service';

describe('CaseIocsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should build query and call ApiService.get with built path + options', async () => {
		const params: ListCaseIocsParams = {
			page: 2,
			per_page: 25,
			order_by: 'ioc_value',
			sort_dir: 'asc'
		};

		const options: ApiOptions = { skipTokenRefresh: true };
		const builtPath = '/api/v2/cases/73/iocs?page=2&per_page=25&order_by=ioc_value&sort_dir=asc';

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				total: 1,
				data: [
					{
						ioc_id: 11,
						ioc_value: '8.8.8.8',
						ioc_type_id: 1,
						ioc_tlp_id: 2
					} as Ioc
				],
				last_page: 1,
				current_page: 2,
				next_page: null
			} satisfies Paginated<Ioc>
		};

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseIocsService.list(73, params, options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/cases/73/iocs', params);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(builtPath, options);

		expect(res).toBe(mockResponse);
	});

	it('get() should call ApiService.get with /api/v2/cases/{caseId}/iocs/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				ioc_id: 11,
				ioc_value: '8.8.8.8',
				ioc_type_id: 1,
				ioc_tlp_id: 2
			} as Ioc
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseIocsService.get(73, 11, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/cases/73/iocs/11', options);
		expect(res).toBe(mockResponse);
	});

	it('getById() should call ApiService.get with /api/v2/iocs/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				ioc_id: 11,
				ioc_value: '8.8.8.8',
				ioc_type_id: 1,
				ioc_tlp_id: 2
			} as Ioc
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseIocsService.getById(11, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/iocs/11', options);
		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /api/v2/cases/{caseId}/iocs, body, options', async () => {
		const body: CreateCaseIocBody = {
			ioc_value: '8.8.8.8',
			ioc_type_id: 1,
			ioc_tlp_id: 2,
			ioc_description: 'Google DNS',
			ioc_misp: null,
			ioc_tags: 'dns'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 201,
			data: {
				ioc_id: 11,
				ioc_value: '8.8.8.8',
				ioc_type_id: 1,
				ioc_tlp_id: 2
			} as Ioc
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseIocsService.create(73, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/api/v2/cases/73/iocs', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.put with /api/v2/cases/{caseId}/iocs/{id}, body, options', async () => {
		const body: UpdateCaseIocBody = {
			ioc_value: '1.1.1.1',
			ioc_type_id: 1,
			ioc_tlp_id: 2,
			ioc_description: 'Cloudflare DNS',
			ioc_misp: null,
			ioc_tags: 'dns,cloudflare'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				ioc_id: 11,
				ioc_value: '1.1.1.1',
				ioc_type_id: 1,
				ioc_tlp_id: 2
			} as Ioc
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseIocsService.update(73, 11, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/api/v2/cases/73/iocs/11', body, options);
		expect(res).toBe(mockResponse);
	});

	it('updateById() should call ApiService.put with /api/v2/iocs/{id}, body, options', async () => {
		const body: UpdateCaseIocBody = {
			ioc_value: '1.1.1.1',
			ioc_type_id: 1,
			ioc_tlp_id: 2,
			ioc_description: 'Cloudflare DNS',
			ioc_tags: 'dns,cloudflare'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				ioc_id: 11,
				ioc_value: '1.1.1.1',
				ioc_type_id: 1,
				ioc_tlp_id: 2
			} as Ioc
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseIocsService.updateById(11, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/api/v2/iocs/11', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() should call ApiService.delete with /api/v2/cases/{caseId}/iocs/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseIocsService.remove(73, 11, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/cases/73/iocs/11', options);
		expect(res).toBe(mockResponse);
	});

	it('removeById() should call ApiService.delete with /api/v2/iocs/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await CaseIocsService.removeById(11, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/iocs/11', options);
		expect(res).toBe(mockResponse);
	});
});

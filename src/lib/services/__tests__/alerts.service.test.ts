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

import { AlertService } from '../alerts.service';
import { ApiService } from '../api.service';

import type { Alert } from '$lib/types/resources/alert';
import type { ApiOptions } from '../api.service';
import type {
	CreateAlertBody,
	UpdateAlertBody,
	FilterAlertsParams,
	MergeAlertBody,
	EscalateAlertBody
} from '../alerts.service';
import type { FilterAlertsMessage } from '../alerts.service';

describe('AlertService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('list() should build query (comma-separated arrays) and call ApiService.get with built path + options', async () => {
		const params: FilterAlertsParams = {
			page: 2,
			per_page: 50,
			alert_ids: [10, 20, 30],
			alert_tags: ['tag1', 'tag2'],
			alert_assets: ['asset-a', 'asset-b'],
			alert_iocs: ['ioc1', 'ioc2'],
			sort: 'desc'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const expectedQuery = {
			...params,
			alert_ids: '10,20,30',
			alert_tags: 'tag1,tag2',
			alert_assets: 'asset-a,asset-b',
			alert_iocs: 'ioc1,ioc2'
		} satisfies Record<string, unknown>;

		const builtPath =
			'/alerts/filter?page=2&per_page=50&alert_ids=10,20,30&alert_tags=tag1,tag2&alert_assets=asset-a,asset-b&alert_iocs=ioc1,ioc2&sort=desc';

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(builtPath);

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				status: 'success',
				message: 'ok',
				data: {
					total: 1,
					alerts: [{ alert_id: 10 } as unknown as Alert],
					last_page: 1,
					current_page: 2,
					next_page: null
				}
			} satisfies FilterAlertsMessage
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertService.list(params, options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith('/alerts/filter', expectedQuery);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith(builtPath, options);

		expect(res).toBe(mockResponse);
	});

	it('get() should call ApiService.get with /api/v2/alerts/{id} + options', async () => {
		const mockAlert = { alert_id: 10 } as unknown as Alert;

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: mockAlert
		};

		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertService.get(10, options);

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/alerts/10', options);
		expect(res).toBe(mockResponse);
	});

	it('create() should call ApiService.post with /api/v2/alerts, body, options', async () => {
		const body: CreateAlertBody = {
			alert_title: 'Alert 1',
			alert_severity_id: 2,
			alert_customer_id: 1,
			alert_classification_id: 3,
			alert_description: 'desc',
			cases: []
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { alert_id: 123 } as unknown as Alert
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertService.create(body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/api/v2/alerts', body, options);
		expect(res).toBe(mockResponse);
	});

	it('update() should call ApiService.put with /api/v2/alerts/{id}, body, options', async () => {
		const body: UpdateAlertBody = {
			alert_description: 'updated',
			alert_tags: 't1,t2'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { alert_id: 10 } as unknown as Alert
		};

		(ApiService.put as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertService.update(10, body, options);

		expect(ApiService.put).toHaveBeenCalledTimes(1);
		expect(ApiService.put).toHaveBeenCalledWith('/api/v2/alerts/10', body, options);
		expect(res).toBe(mockResponse);
	});

	it('remove() should call ApiService.delete with /api/v2/alerts/{id} + options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 204,
			data: null
		};

		(ApiService.delete as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertService.remove(10, options);

		expect(ApiService.delete).toHaveBeenCalledTimes(1);
		expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/alerts/10', options);
		expect(res).toBe(mockResponse);
	});

	it('getRelatedAlerts() should call ApiService.get with /api/v2/alerts/{id}/related-alerts + options', async () => {
		const params = {};
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { nodes: [], edges: [] }
		};

		(ApiService.withQuery as unknown as ReturnType<typeof vi.fn>).mockReturnValueOnce(
			'/api/v2/alerts/10/related-alerts'
		);
		(ApiService.get as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertService.getRelatedAlerts(10, params, options);

		expect(ApiService.withQuery).toHaveBeenCalledTimes(1);
		expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/alerts/10/related-alerts', {
			'open-alerts': undefined,
			'closed-alerts': undefined,
			'open-cases': undefined,
			'closed-cases': undefined,
			'days-back': undefined,
			'number-of-nodes': undefined
		});

		expect(ApiService.get).toHaveBeenCalledTimes(1);
		expect(ApiService.get).toHaveBeenCalledWith('/api/v2/alerts/10/related-alerts', options);
		expect(res).toEqual(mockResponse);
	});

	it('merge() should call ApiService.post with /alerts/merge/{id}, body, options', async () => {
		const body: MergeAlertBody = {
			target_case_id: 123,
			iocs_import_list: ['ioc-1', 'ioc-2'],
			assets_import_list: ['asset-1'],
			note: 'merge note',
			import_as_event: true
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				status: 'success',
				message: 'ok',
				data: {
					case_id: 123
				}
			}
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertService.merge(10, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/alerts/merge/10', body, options);
		expect(res).toBe(mockResponse);
	});

	it('unmerge() should call ApiService.post with /alerts/unmerge/{id}, empty body, options', async () => {
		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: { alert_id: 10 } as unknown as Alert
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertService.unmerge(10, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/alerts/unmerge/10', {}, options);
		expect(res).toBe(mockResponse);
	});

	it('escalate() should call ApiService.post with /alerts/escalate/{id}, body, options', async () => {
		const body: EscalateAlertBody = {
			iocs_import_list: ['ioc-1'],
			assets_import_list: ['asset-1'],
			note: 'escalate note',
			import_as_event: false,
			case_tags: 'tag1,tag2',
			case_template_id: '5',
			case_title: 'Escalated case'
		};

		const options: ApiOptions = { skipTokenRefresh: true };

		const mockResponse = {
			ok: true,
			status: 200,
			data: {
				status: 'success',
				message: 'ok',
				data: {
					case_id: 999
				}
			}
		};

		(ApiService.post as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockResponse);

		const res = await AlertService.escalate(10, body, options);

		expect(ApiService.post).toHaveBeenCalledTimes(1);
		expect(ApiService.post).toHaveBeenCalledWith('/alerts/escalate/10', body, options);
		expect(res).toBe(mockResponse);
	});
});

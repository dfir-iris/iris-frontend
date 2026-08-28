import { describe, it, expect, vi, beforeEach } from 'vitest';

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

import { AlertClustersService } from '../alert-clusters.service';
import { ApiService } from '../api.service';

const mockWithQuery = ApiService.withQuery as unknown as ReturnType<typeof vi.fn>;
const mockGet = ApiService.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = ApiService.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = ApiService.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = ApiService.delete as unknown as ReturnType<typeof vi.fn>;

describe('AlertClustersService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWithQuery.mockReturnValue('/api/v2/alert-clusters');
		mockGet.mockResolvedValue({ ok: true, data: null });
		mockPost.mockResolvedValue({ ok: true, data: null });
		mockPut.mockResolvedValue({ ok: true, data: null });
		mockDelete.mockResolvedValue({ ok: true, data: null });
	});

	describe('list', () => {
		it('builds url with withQuery and calls get', async () => {
			const builtPath = '/api/v2/alert-clusters?page=1';
			mockWithQuery.mockReturnValue(builtPath);
			const result = await AlertClustersService.list({ page: 1 });
			expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/alert-clusters', { page: 1 });
			expect(ApiService.get).toHaveBeenCalledWith(builtPath, {});
			expect(result).toEqual({ ok: true, data: null });
		});

		it('passes empty params when called with no arguments', async () => {
			await AlertClustersService.list();
			expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/alert-clusters', {});
		});

		it('passes all filter params to withQuery', async () => {
			await AlertClustersService.list({
				page: 2,
				per_page: 20,
				customer_id: 5,
				status_id: 3,
				title: 'Phishing',
				sort: 'created_at'
			});
			expect(ApiService.withQuery).toHaveBeenCalledWith('/api/v2/alert-clusters', {
				page: 2,
				per_page: 20,
				customer_id: 5,
				status_id: 3,
				title: 'Phishing',
				sort: 'created_at'
			});
		});

		it('passes ApiOptions to get', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertClustersService.list({}, opts);
			expect(ApiService.get).toHaveBeenCalledWith(expect.any(String), opts);
		});
	});

	describe('get', () => {
		it('calls get with the correct id path', async () => {
			const response = { ok: true, data: { cluster_id: 42 } };
			mockGet.mockResolvedValueOnce(response);
			const result = await AlertClustersService.get(42);
			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/alert-clusters/42', {});
			expect(result).toBe(response);
		});

		it('passes ApiOptions to get', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertClustersService.get(1, opts);
			expect(ApiService.get).toHaveBeenCalledWith('/api/v2/alert-clusters/1', opts);
		});
	});

	describe('create', () => {
		it('posts to /api/v2/alert-clusters with the body', async () => {
			const body = {
				cluster_title: 'New cluster',
				cluster_status_id: 1,
				cluster_customer_id: 10
			};
			const response = { ok: true, data: { cluster_id: 99 } };
			mockPost.mockResolvedValueOnce(response);
			const result = await AlertClustersService.create(body);
			expect(ApiService.post).toHaveBeenCalledWith('/api/v2/alert-clusters', body, {});
			expect(result).toBe(response);
		});

		it('passes ApiOptions to post', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertClustersService.create(
				{ cluster_title: 't', cluster_status_id: 1, cluster_customer_id: 1 },
				opts
			);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/alert-clusters',
				expect.any(Object),
				opts
			);
		});
	});

	describe('update', () => {
		it('calls put (not patch) with the correct id path and body', async () => {
			const body = { cluster_title: 'Updated title' };
			const response = { ok: true, data: { cluster_id: 7 } };
			mockPut.mockResolvedValueOnce(response);
			const result = await AlertClustersService.update(7, body);
			expect(ApiService.put).toHaveBeenCalledWith('/api/v2/alert-clusters/7', body, {});
			expect(ApiService.patch).not.toHaveBeenCalled();
			expect(result).toBe(response);
		});

		it('passes ApiOptions to put', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertClustersService.update(1, {}, opts);
			expect(ApiService.put).toHaveBeenCalledWith('/api/v2/alert-clusters/1', {}, opts);
		});
	});

	describe('remove', () => {
		it('calls delete with the correct id path', async () => {
			const response = { ok: true, data: null };
			mockDelete.mockResolvedValueOnce(response);
			const result = await AlertClustersService.remove(3);
			expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/alert-clusters/3', {});
			expect(result).toBe(response);
		});

		it('passes ApiOptions to delete', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertClustersService.remove(1, opts);
			expect(ApiService.delete).toHaveBeenCalledWith('/api/v2/alert-clusters/1', opts);
		});
	});

	describe('addAlerts', () => {
		it('posts the alert_ids array to the alerts sub-resource', async () => {
			const response = { ok: true, data: { cluster_id: 5 } };
			mockPost.mockResolvedValueOnce(response);
			const result = await AlertClustersService.addAlerts(5, [10, 11, 12]);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/5/alerts',
				{ alert_ids: [10, 11, 12] },
				{}
			);
			expect(result).toBe(response);
		});

		it('passes an empty array when no alert ids are given', async () => {
			await AlertClustersService.addAlerts(5, []);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/5/alerts',
				{ alert_ids: [] },
				{}
			);
		});

		it('passes ApiOptions to post', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertClustersService.addAlerts(1, [2], opts);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/1/alerts',
				{ alert_ids: [2] },
				opts
			);
		});
	});

	describe('removeAlert', () => {
		it('calls delete with the correct cluster and alert id path', async () => {
			const response = { ok: true, data: { cluster_id: 5 } };
			mockDelete.mockResolvedValueOnce(response);
			const result = await AlertClustersService.removeAlert(5, 20);
			expect(ApiService.delete).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/5/alerts/20',
				{}
			);
			expect(result).toBe(response);
		});

		it('passes ApiOptions to delete', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertClustersService.removeAlert(1, 2, opts);
			expect(ApiService.delete).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/1/alerts/2',
				opts
			);
		});
	});

	describe('escalate', () => {
		it('posts to the escalate sub-resource with the body', async () => {
			const body = { template_id: 3, case_title: 'Incident', note: 'escalated' };
			const response = { ok: true, data: { cluster_id: 6, case_id: 100 } };
			mockPost.mockResolvedValueOnce(response);
			const result = await AlertClustersService.escalate(6, body);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/6/escalate',
				body,
				{}
			);
			expect(result).toBe(response);
		});

		it('accepts an empty body', async () => {
			await AlertClustersService.escalate(1, {});
			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/1/escalate',
				{},
				{}
			);
		});

		it('passes ApiOptions to post', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertClustersService.escalate(1, {}, opts);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/1/escalate',
				{},
				opts
			);
		});
	});

	describe('merge', () => {
		it('posts to the merge sub-resource with the body', async () => {
			const body = { target_case_id: 55, note: 'merge note' };
			const response = { ok: true, data: { cluster_id: 8, case_id: 55 } };
			mockPost.mockResolvedValueOnce(response);
			const result = await AlertClustersService.merge(8, body);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/8/merge',
				body,
				{}
			);
			expect(result).toBe(response);
		});

		it('passes ApiOptions to post', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertClustersService.merge(1, { target_case_id: 2 }, opts);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/1/merge',
				{ target_case_id: 2 },
				opts
			);
		});
	});

	describe('forCase', () => {
		it('calls get with the case source-alert-cluster path', async () => {
			const response = { ok: true, data: { cluster_id: 9, cluster_title: 'src', cluster_status: null } };
			mockGet.mockResolvedValueOnce(response);
			const result = await AlertClustersService.forCase(101);
			expect(ApiService.get).toHaveBeenCalledWith(
				'/api/v2/cases/101/source-alert-cluster',
				{}
			);
			expect(result).toBe(response);
		});

		it('passes ApiOptions to get', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertClustersService.forCase(1, opts);
			expect(ApiService.get).toHaveBeenCalledWith(
				'/api/v2/cases/1/source-alert-cluster',
				opts
			);
		});
	});

	describe('unlinkCase', () => {
		it('calls delete on the case sub-resource of the cluster', async () => {
			const response = { ok: true, data: { unlinked: true, cluster_id: 12 } };
			mockDelete.mockResolvedValueOnce(response);
			const result = await AlertClustersService.unlinkCase(12);
			expect(ApiService.delete).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/12/case',
				{}
			);
			expect(result).toBe(response);
		});

		it('passes ApiOptions to delete', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertClustersService.unlinkCase(1, opts);
			expect(ApiService.delete).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/1/case',
				opts
			);
		});
	});

	describe('graph', () => {
		it('calls get on the graph sub-resource', async () => {
			const response = {
				ok: true,
				data: { nodes: [], edges: [] }
			};
			mockGet.mockResolvedValueOnce(response);
			const result = await AlertClustersService.graph(15);
			expect(ApiService.get).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/15/graph',
				{}
			);
			expect(result).toBe(response);
		});

		it('passes ApiOptions to get', async () => {
			const opts = { signal: new AbortController().signal };
			await AlertClustersService.graph(1, opts);
			expect(ApiService.get).toHaveBeenCalledWith(
				'/api/v2/alert-clusters/1/graph',
				opts
			);
		});
	});
});

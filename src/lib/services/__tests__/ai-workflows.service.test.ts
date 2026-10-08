import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn(),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { AiWorkflowsService, aiListData, type AiWorkflowBody } from '../ai-workflows.service';
import { ApiService } from '../api.service';

const mockGet = ApiService.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = ApiService.post as unknown as ReturnType<typeof vi.fn>;
const mockPut = ApiService.put as unknown as ReturnType<typeof vi.fn>;
const mockDelete = ApiService.delete as unknown as ReturnType<typeof vi.fn>;
const mockWithQuery = ApiService.withQuery as unknown as ReturnType<typeof vi.fn>;

const body: AiWorkflowBody = {
	name: 'Triage',
	description: null,
	is_active: false,
	trigger_type: 'manual',
	trigger_config: { entity_types: ['alert'] },
	customer_scope: [],
	graph: { nodes: [], edges: [] },
	write_tool_allowlist: [],
	max_runs_per_hour: 60,
	token_budget_per_run: 50000,
	suggestion_audience: 'entity'
};

describe('AiWorkflowsService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGet.mockResolvedValue({ ok: true, data: null });
		mockPost.mockResolvedValue({ ok: true, data: null });
		mockPut.mockResolvedValue({ ok: true, data: null });
		mockDelete.mockResolvedValue({ ok: true, data: null });
		mockWithQuery.mockImplementation((path: string, params: Record<string, unknown>) => {
			const qs = new URLSearchParams(params as Record<string, string>).toString();
			return qs ? `${path}?${qs}` : path;
		});
	});

	it('lists, gets and deletes workflows', async () => {
		await AiWorkflowsService.list();
		expect(mockGet).toHaveBeenCalledWith('/ai-workflows', {});
		await AiWorkflowsService.get(7);
		expect(mockGet).toHaveBeenCalledWith('/ai-workflows/7', {});
		await AiWorkflowsService.remove(7);
		expect(mockDelete).toHaveBeenCalledWith('/ai-workflows/7', {});
	});

	it('creates and updates', async () => {
		await AiWorkflowsService.create(body);
		expect(mockPost).toHaveBeenCalledWith('/ai-workflows', body, {});
		await AiWorkflowsService.update(3, { ...body, version_note: 'v2' });
		expect(mockPut).toHaveBeenCalledWith('/ai-workflows/3', { ...body, version_note: 'v2' }, {});
	});

	it('reads the catalogue and validates', async () => {
		await AiWorkflowsService.catalogue();
		expect(mockGet).toHaveBeenCalledWith('/ai-workflows/catalogue', {});
		const v = {
			graph: body.graph,
			trigger_type: body.trigger_type,
			trigger_config: body.trigger_config,
			write_tool_allowlist: []
		};
		await AiWorkflowsService.validate(v);
		expect(mockPost).toHaveBeenCalledWith('/ai-workflows/validate', v, {});
	});

	it('reads versions', async () => {
		await AiWorkflowsService.versions(4);
		expect(mockGet).toHaveBeenCalledWith('/ai-workflows/4/versions', {});
		await AiWorkflowsService.version(4, 2);
		expect(mockGet).toHaveBeenCalledWith('/ai-workflows/4/versions/2', {});
	});

	it('runs a workflow and rotates the inbound token', async () => {
		const req = { entity_type: 'alert' as const, entity_id: 12, dry_run: true };
		await AiWorkflowsService.run(4, req);
		expect(mockPost).toHaveBeenCalledWith('/ai-workflows/4/run', req, {});
		await AiWorkflowsService.rotateInboundToken(4);
		expect(mockPost).toHaveBeenCalledWith('/ai-workflows/4/inbound-token', {}, {});
	});

	it('pages runs with defaults', async () => {
		await AiWorkflowsService.runs();
		expect(mockWithQuery).toHaveBeenCalledWith('/ai-workflows/runs', { page: 1, per_page: 25 });
		expect(mockGet).toHaveBeenCalledWith('/ai-workflows/runs?page=1&per_page=25', {});
	});

	it('filters runs, dropping empty filters', async () => {
		await AiWorkflowsService.runs({
			workflow_id: 2,
			status: 'failed',
			entity_type: 'case',
			entity_id: null,
			page: 3,
			per_page: 50
		});
		expect(mockWithQuery).toHaveBeenCalledWith('/ai-workflows/runs', {
			page: 3,
			per_page: 50,
			workflow_id: 2,
			status: 'failed',
			entity_type: 'case'
		});
	});

	it('drives a run by uuid', async () => {
		await AiWorkflowsService.getRun('abc');
		expect(mockGet).toHaveBeenCalledWith('/ai-workflows/runs/abc', {});
		await AiWorkflowsService.cancelRun('abc');
		expect(mockPost).toHaveBeenCalledWith('/ai-workflows/runs/abc/cancel', {}, {});
		await AiWorkflowsService.rerun('abc');
		expect(mockPost).toHaveBeenCalledWith('/ai-workflows/runs/abc/rerun', {}, {});
		await AiWorkflowsService.exportRun('abc');
		expect(mockGet).toHaveBeenCalledWith('/ai-workflows/runs/abc/export', {});
	});

	it('lists inbound events, optionally per workflow', async () => {
		await AiWorkflowsService.inboundEvents();
		expect(mockGet).toHaveBeenCalledWith('/ai-workflows/inbound-events', {});
		await AiWorkflowsService.inboundEvents(9);
		expect(mockGet).toHaveBeenCalledWith('/ai-workflows/inbound-events?workflow_id=9', {});
	});

	it('forwards options', async () => {
		const options = { skipAuthRedirect: true };
		await AiWorkflowsService.list(options);
		expect(mockGet).toHaveBeenCalledWith('/ai-workflows', options);
	});
});

describe('aiListData', () => {
	it('accepts arrays and envelopes', () => {
		expect(aiListData([1, 2])).toEqual([1, 2]);
		expect(aiListData({ data: [3], total: 1 })).toEqual([3]);
		expect(aiListData(null)).toEqual([]);
		expect(aiListData('nope')).toEqual([]);
	});
});

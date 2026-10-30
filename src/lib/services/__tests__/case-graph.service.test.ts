import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn((path: string, params?: Record<string, unknown>) => {
			const qs = new URLSearchParams();
			for (const [k, v] of Object.entries(params ?? {})) {
				if (v != null) qs.set(k, String(v));
			}
			const s = qs.toString();
			return s ? `${path}?${s}` : path;
		}),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		delete: vi.fn()
	}
}));

import { CaseGraphService } from '../case-graph.service';
import { ApiService } from '../api.service';
import type { ApiOptions } from '../api.service';

const mocked = ApiService as unknown as Record<
	'withQuery' | 'get' | 'post' | 'put' | 'delete',
	ReturnType<typeof vi.fn>
>;

const opts: ApiOptions = { skipTokenRefresh: true };
const ok = { ok: true, status: 200, data: {} };

describe('CaseGraphService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocked.get.mockResolvedValue(ok);
		mocked.post.mockResolvedValue(ok);
		mocked.put.mockResolvedValue(ok);
		mocked.delete.mockResolvedValue(ok);
	});

	describe('read routes', () => {
		it('get() joins include as a comma list and passes review_state', async () => {
			const res = await CaseGraphService.get(
				3,
				{ include: ['events', 'cross_case'], review_state: 'all' },
				opts
			);
			expect(mocked.withQuery).toHaveBeenCalledWith('/api/v2/cases/3/graph', {
				include: 'events,cross_case',
				review_state: 'all'
			});
			expect(mocked.get).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph?include=events%2Ccross_case&review_state=all',
				opts
			);
			expect(res).toBe(ok);
		});

		it('get() without include sends no query', async () => {
			await CaseGraphService.get(3);
			expect(mocked.get).toHaveBeenCalledWith('/api/v2/cases/3/graph', {});
		});

		it('neighbours() sends node and hops', async () => {
			await CaseGraphService.neighbours(3, 'asset:12', 2, opts);
			expect(mocked.get).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/neighbours?node=asset%3A12&hops=2',
				opts
			);
		});

		it('neighbours() defaults to one hop', async () => {
			await CaseGraphService.neighbours(3, 'ioc:1');
			expect(mocked.get).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/neighbours?node=ioc%3A1&hops=1',
				{}
			);
		});

		it('paths() forwards every query parameter', async () => {
			await CaseGraphService.paths(
				3,
				{ source: 'asset:1', target: 'ioc:2', directed: false, max_paths: 5, max_length: 8 },
				opts
			);
			expect(mocked.withQuery).toHaveBeenCalledWith('/api/v2/cases/3/graph/paths', {
				source: 'asset:1',
				target: 'ioc:2',
				directed: false,
				max_paths: 5,
				max_length: 8
			});
			expect(mocked.get).toHaveBeenCalledTimes(1);
		});
	});

	describe('stored edges', () => {
		it('createEdge() POSTs the body', async () => {
			const body = { source: 'asset:4', target: 'asset:12', relation: 'lateral_movement' };
			await CaseGraphService.createEdge(3, body, opts);
			expect(mocked.post).toHaveBeenCalledWith('/api/v2/cases/3/graph/edges', body, opts);
		});

		it('updateEdge() PUTs on the edge id', async () => {
			await CaseGraphService.updateEdge(3, 57, { confidence: 80 }, opts);
			expect(mocked.put).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/edges/57',
				{ confidence: 80 },
				opts
			);
		});

		it('deleteEdge() DELETEs the edge', async () => {
			await CaseGraphService.deleteEdge(3, 57, opts);
			expect(mocked.delete).toHaveBeenCalledWith('/api/v2/cases/3/graph/edges/57', opts);
		});

		it('reviewEdge() POSTs the decision', async () => {
			await CaseGraphService.reviewEdge(3, 57, 'reject', opts);
			expect(mocked.post).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/edges/57/review',
				{ decision: 'reject' },
				opts
			);
		});

		it('reverseEdge() POSTs without body', async () => {
			await CaseGraphService.reverseEdge(3, 57, opts);
			expect(mocked.post).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/edges/57/reverse',
				undefined,
				opts
			);
		});
	});

	describe('free nodes', () => {
		it('createNode() / updateNode() / deleteNode()', async () => {
			await CaseGraphService.createNode(3, { label: 'APT', node_type: 'actor' }, opts);
			expect(mocked.post).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/nodes',
				{ label: 'APT', node_type: 'actor' },
				opts
			);
			await CaseGraphService.updateNode(3, 9, { label: 'APT29' }, opts);
			expect(mocked.put).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/nodes/9',
				{ label: 'APT29' },
				opts
			);
			await CaseGraphService.deleteNode(3, 9, opts);
			expect(mocked.delete).toHaveBeenCalledWith('/api/v2/cases/3/graph/nodes/9', opts);
		});

		it('promoteNode() POSTs kind and creation fields', async () => {
			const body = { kind: 'ioc' as const, ioc_value: '1.2.3.4', ioc_type_id: 76 };
			await CaseGraphService.promoteNode(3, 9, body, opts);
			expect(mocked.post).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/nodes/9/promote',
				body,
				opts
			);
		});
	});

	it('paste() POSTs the text payload', async () => {
		const body = { text: '1.2.3.4 evil.com', link_to: 'asset:1', relation: 'connected_to' };
		await CaseGraphService.paste(3, body, opts);
		expect(mocked.post).toHaveBeenCalledWith('/api/v2/cases/3/graph/paste', body, opts);
	});

	describe('views', () => {
		const state = {
			layout: 'fcose',
			positions: {},
			pinned: [],
			hidden: [],
			collapsed: [],
			filters: {},
			viewport: null,
			time: null,
			include: []
		};

		it('list / create / get / update / delete', async () => {
			await CaseGraphService.listViews(3, opts);
			expect(mocked.get).toHaveBeenCalledWith('/api/v2/cases/3/graph/views', opts);

			await CaseGraphService.createView(3, { name: 'v', state }, opts);
			expect(mocked.post).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/views',
				{ name: 'v', state },
				opts
			);

			await CaseGraphService.getView(3, 4, opts);
			expect(mocked.get).toHaveBeenCalledWith('/api/v2/cases/3/graph/views/4', opts);

			await CaseGraphService.updateView(3, 4, { is_shared: true }, opts);
			expect(mocked.put).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/views/4',
				{ is_shared: true },
				opts
			);

			await CaseGraphService.deleteView(3, 4, opts);
			expect(mocked.delete).toHaveBeenCalledWith('/api/v2/cases/3/graph/views/4', opts);
		});
	});

	describe('import / export', () => {
		it('exportGraph() sends the format, json by default', async () => {
			await CaseGraphService.exportGraph(3);
			expect(mocked.get).toHaveBeenCalledWith('/api/v2/cases/3/graph/export?format=json', {});
			await CaseGraphService.exportGraph(3, 'graphml', opts);
			expect(mocked.get).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/export?format=graphml',
				opts
			);
		});

		it('importGraph() POSTs format and content', async () => {
			await CaseGraphService.importGraph(3, { format: 'stix', content: { type: 'bundle' } }, opts);
			expect(mocked.post).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/import',
				{ format: 'stix', content: { type: 'bundle' } },
				opts
			);
		});
	});

	describe('intelligence', () => {
		it('suggestions list / accept / dismiss / ai', async () => {
			await CaseGraphService.listSuggestions(3, opts);
			expect(mocked.get).toHaveBeenCalledWith('/api/v2/cases/3/graph/suggestions', opts);

			await CaseGraphService.acceptSuggestions(3, ['k1'], opts);
			expect(mocked.post).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/suggestions/accept',
				{ keys: ['k1'] },
				opts
			);

			await CaseGraphService.dismissSuggestions(3, ['k2'], opts);
			expect(mocked.post).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/suggestions/dismiss',
				{ keys: ['k2'] },
				opts
			);

			await CaseGraphService.aiSuggestions(3, opts);
			expect(mocked.post).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/suggestions/ai',
				undefined,
				opts
			);
		});

		it('gaps() and explain()', async () => {
			await CaseGraphService.gaps(3, opts);
			expect(mocked.get).toHaveBeenCalledWith('/api/v2/cases/3/graph/gaps', opts);

			await CaseGraphService.explain(3, { node_keys: ['asset:1'] }, opts);
			expect(mocked.post).toHaveBeenCalledWith(
				'/api/v2/cases/3/graph/explain',
				{ node_keys: ['asset:1'] },
				opts
			);

			await CaseGraphService.explain(3);
			expect(mocked.post).toHaveBeenLastCalledWith('/api/v2/cases/3/graph/explain', {}, {});
		});
	});

	describe('relation type catalogue', () => {
		it('list / create / update / delete / reorder', async () => {
			await CaseGraphService.listRelationTypes(opts);
			expect(mocked.get).toHaveBeenCalledWith('/api/v2/manage/graph-relation-types', opts);

			await CaseGraphService.createRelationType({ name: 'x', label: 'X' }, opts);
			expect(mocked.post).toHaveBeenCalledWith(
				'/api/v2/manage/graph-relation-types',
				{ name: 'x', label: 'X' },
				opts
			);

			await CaseGraphService.updateRelationType(7, { color: 'red' }, opts);
			expect(mocked.put).toHaveBeenCalledWith(
				'/api/v2/manage/graph-relation-types/7',
				{ color: 'red' },
				opts
			);

			await CaseGraphService.deleteRelationType(7, opts);
			expect(mocked.delete).toHaveBeenCalledWith('/api/v2/manage/graph-relation-types/7', opts);

			await CaseGraphService.reorderRelationTypes([3, 1, 2], opts);
			expect(mocked.post).toHaveBeenCalledWith(
				'/api/v2/manage/graph-relation-types/reorder',
				{ ids: [3, 1, 2] },
				opts
			);
		});
	});

	it('getWarRoomGraph() targets the war-room route', async () => {
		await CaseGraphService.getWarRoomGraph(8, { include: ['events'] }, opts);
		expect(mocked.get).toHaveBeenCalledWith('/api/v2/war-rooms/8/graph?include=events', opts);
	});
});

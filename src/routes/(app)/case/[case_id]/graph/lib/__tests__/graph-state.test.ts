import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import type { CaseGraph, GraphEdge } from '$lib/types/resources/case-graph';
import { edge, node } from './fixtures';

const svc = vi.hoisted(() => ({
	get: vi.fn(),
	neighbours: vi.fn(),
	paths: vi.fn(),
	createEdge: vi.fn(),
	updateEdge: vi.fn(),
	deleteEdge: vi.fn(),
	reverseEdge: vi.fn(),
	reviewEdge: vi.fn(),
	createNode: vi.fn(),
	updateNode: vi.fn(),
	deleteNode: vi.fn(),
	promoteNode: vi.fn(),
	paste: vi.fn()
}));
const assets = vi.hoisted(() => ({ update: vi.fn() }));
const iocs = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn() }));
const flags = vi.hoisted(() => ({ setAssetFlag: vi.fn(), clearAssetFlag: vi.fn() }));

vi.mock('$lib/services/case-graph.service', () => ({ CaseGraphService: svc }));
vi.mock('$lib/services/case-assets.service', () => ({ CaseAssetsService: assets }));
vi.mock('$lib/services/case-iocs.service', () => ({ CaseIocsService: iocs }));
vi.mock('$lib/services/asset-flags.service', () => ({ AssetFlagsService: flags }));

const { CaseGraphState } = await import('../graph-state.svelte');

const ok = <T>(data: T, status = 200) => Promise.resolve({ status, ok: true, data });
const fail = (message: string, status = 400) =>
	Promise.resolve({ status, ok: false, data: { message } });

const graphOf = (nodes = baseNodes(), edges: GraphEdge[] = baseEdges()): CaseGraph => ({
	nodes,
	edges,
	events: [],
	relation_types: [
		{
			id: 2,
			name: 'resolves_to',
			label: 'Resolves to',
			color: 'blue',
			line_style: 'solid',
			directed: true,
			sort_order: 2
		} as never,
		{
			id: 1,
			name: 'connected_to',
			label: 'Connected to',
			color: 'slate',
			line_style: 'solid',
			directed: false,
			sort_order: 1
		} as never
	],
	meta: { generated_at: '2024-01-01T00:00:00Z' } as never
});

const baseNodes = () => [
	node('asset:1', { tags: ['dc'] }),
	node('ioc:2'),
	node('ioc:3'),
	node('node:4', { type: 'actor', label: 'APT' })
];
const baseEdges = () => [
	edge('asset:1', 'ioc:2', { id: 10 }),
	edge('node:4', 'asset:1', { id: 11, label: 'targets' })
];

const makeState = async () => {
	svc.get.mockImplementation(() => ok(graphOf()));
	const s = new CaseGraphState(7);
	await s.load();
	return s;
};

beforeEach(() => {
	vi.clearAllMocks();
	localStorage.clear();
});

describe('CaseGraphState loading', () => {
	it('loads the graph with every review state and derives visibility', async () => {
		const s = await makeState();
		expect(svc.get).toHaveBeenCalledWith(7, { include: [], review_state: 'all' });
		expect(s.error).toBeNull();
		expect(s.relationTypes.map((r) => r.name)).toEqual(['connected_to', 'resolves_to']);
		expect([...s.visibility.nodes].sort()).toEqual(['asset:1', 'ioc:2', 'node:4']);
		expect(s.offCanvas.map((n) => n.key)).toEqual(['ioc:3']);
		expect(s.output.elements.length).toBe(5);
	});

	it('reports the backend error', async () => {
		svc.get.mockImplementation(() => fail('Forbidden', 403));
		const s = new CaseGraphState(7);
		await s.load();
		expect(s.error).toBe('Forbidden');
		expect(s.loading).toBe(false);
	});

	it('refetches with the new include list', async () => {
		const s = await makeState();
		await s.setInclude(['events', 'notes']);
		expect(svc.get).toHaveBeenLastCalledWith(7, {
			include: ['events', 'notes'],
			review_state: 'all'
		});
	});

	it('merges and replays neighbour expansions', async () => {
		const s = await makeState();
		svc.neighbours.mockImplementation(() =>
			ok({ nodes: [node('ioc:3'), node('event:9')], edges: [edge('ioc:3', 'event:9')] })
		);
		expect(await s.expand('ioc:3', 2)).toBe(2);
		expect(svc.neighbours).toHaveBeenCalledWith(7, 'ioc:3', 2);
		expect(s.visibility.nodes.has('event:9')).toBe(true);
		expect(s.visibility.nodes.has('ioc:3')).toBe(true);
		await s.refresh();
		expect(svc.neighbours).toHaveBeenCalledTimes(2);
		expect(s.nodes.some((n) => n.key === 'event:9')).toBe(true);
	});

	it('collapses neighbours that only hang off a node', async () => {
		const s = await makeState();
		expect(s.collapse('asset:1')).toBe(2);
		expect(s.hidden.has('ioc:2')).toBe(true);
		expect(s.hidden.has('node:4')).toBe(true);
	});
});

describe('CaseGraphState view state', () => {
	it('round-trips through toViewState / applyViewState and keeps foreign keys', async () => {
		const s = await makeState();
		s.hide(['ioc:2']);
		s.togglePin(['asset:1']);
		s.addToCanvas(['ioc:3'], { x: 10, y: 20 });
		s.overlays.tlp = true;
		s.layout = 'grouped:subnet';
		s.fanoutThreshold = 3;
		const state = { ...s.toViewState(), suggestions_panel: { open: true } };

		const t = await makeState();
		await t.applyViewState(state, { reload: false });
		expect([...t.hidden]).toEqual(['ioc:2']);
		expect([...t.pinned]).toEqual(['asset:1']);
		expect([...t.extraNodes]).toEqual(['ioc:3']);
		expect(t.positions['ioc:3']).toEqual({ x: 10, y: 20 });
		expect(t.overlays.tlp).toBe(true);
		expect(t.layout).toBe('grouped:subnet');
		expect(t.fanoutThreshold).toBe(3);
		expect(t.toViewState().suggestions_panel).toEqual({ open: true });
	});

	it('autosaves to localStorage and restores it', async () => {
		vi.useFakeTimers();
		try {
			const s = await makeState();
			s.hide(['node:4']);
			vi.advanceTimersByTime(1000);
			expect(localStorage.getItem('iris:case-graph:7')).toContain('node:4');
			const t = new CaseGraphState(7);
			expect(t.restoreLocal()).toBe(true);
			await Promise.resolve();
			expect(t.hidden.has('node:4')).toBe(true);
		} finally {
			vi.useRealTimers();
		}
	});

	it('falls back on invalid layouts and filters', async () => {
		const s = await makeState();
		await s.applyViewState(
			{ layout: 'grouped:bogus', filters: { fanout_threshold: -2, show_unlinked: 'yes' } },
			{ reload: false }
		);
		expect(s.layout).toBe('fcose');
		expect(s.fanoutThreshold).toBe(8);
		expect(s.showUnlinked).toBe(false);
	});
});

describe('CaseGraphState exploration', () => {
	it('searches visible nodes and cycles through matches', async () => {
		const s = await makeState();
		s.setQuery('kind:ioc');
		expect(s.matches).toEqual(['ioc:2']);
		s.setQuery('apt');
		expect(s.matches).toEqual(['node:4']);
		expect(s.cycleMatch()).toBe('node:4');
		expect(s.activeMatch).toBe('node:4');
		s.setQuery('');
		expect(s.matches).toBeNull();
	});

	it('finds paths and brings their nodes on the canvas', async () => {
		const s = await makeState();
		s.hide(['ioc:2']);
		svc.paths.mockImplementation(() =>
			ok({
				paths: [{ node_keys: ['node:4', 'asset:1', 'ioc:2'], edge_keys: ['e:11', 'e:10'] }],
				shortest_length: 2
			})
		);
		s.path.source = 'node:4';
		s.path.target = 'ioc:2';
		await s.findPaths();
		expect(svc.paths).toHaveBeenCalledWith(7, {
			source: 'node:4',
			target: 'ioc:2',
			directed: false,
			max_paths: 5,
			max_length: 8
		});
		expect(s.hidden.has('ioc:2')).toBe(false);
		expect(s.highlight?.edges.has('e:10')).toBe(true);
		s.clearPath();
		expect(s.highlight).toBeNull();
	});

	it('reports path errors', async () => {
		const s = await makeState();
		svc.paths.mockImplementation(() => fail('Unknown node'));
		s.path.source = 'node:4';
		s.path.target = 'ioc:2';
		await s.findPaths();
		expect(s.path.error).toBe('Unknown node');
	});

	it('limits the canvas in focus mode', async () => {
		const s = await makeState();
		s.setFocus('ioc:2', 1);
		expect([...s.visibility.nodes].sort()).toEqual(['asset:1', 'ioc:2']);
		s.setFocus(null);
		expect(s.visibility.nodes.size).toBe(3);
	});

	it('applies registered filter hooks and unregisters them', async () => {
		const s = await makeState();
		const off = s.registerFilter('test', { node: (n) => n.kind !== 'node' });
		expect(s.visibility.nodes.has('node:4')).toBe(false);
		off();
		expect(s.visibility.nodes.has('node:4')).toBe(true);
	});

	it('toggles fan-outs', async () => {
		const s = await makeState();
		expect(s.output.fanouts.size).toBe(0);
		s.toggleFanout('asset:1');
		expect(s.output.fanouts.get('fan:asset:1')?.iocs).toEqual(['ioc:2']);
		s.toggleFanout('asset:1');
		expect(s.output.fanouts.size).toBe(0);
		expect(s.expandedFanouts.has('asset:1')).toBe(true);
	});
});

describe('CaseGraphState operations with undo / redo', () => {
	it('creates an edge, undoes and redoes it with id aliasing', async () => {
		const s = await makeState();
		svc.createEdge
			.mockImplementationOnce(() => ok(edge('ioc:3', 'asset:1', { id: 20 }), 201))
			.mockImplementationOnce(() => ok(edge('ioc:3', 'asset:1', { id: 21 }), 201));
		svc.deleteEdge.mockImplementation(() => ok(null, 204));
		await s.createEdge({ source: 'ioc:3', target: 'asset:1', relation: 'connected_to' });
		expect(s.canUndo).toBe(true);
		expect(s.undoLabel).toBe('Create relation');
		await s.undo();
		expect(svc.deleteEdge).toHaveBeenLastCalledWith(7, 20);
		await s.redo();
		expect(svc.createEdge).toHaveBeenCalledTimes(2);
		await s.undo();
		expect(svc.deleteEdge).toHaveBeenLastCalledWith(7, 21);
	});

	it('redoes an edge recorded in the timeline by citing its event', async () => {
		const s = await makeState();
		svc.createEdge
			.mockImplementationOnce(() =>
				ok({ ...edge('ioc:3', 'asset:1', { id: 20 }), timeline_event_id: 90 }, 201)
			)
			.mockImplementationOnce(() => ok(edge('ioc:3', 'asset:1', { id: 21 }), 201));
		svc.deleteEdge.mockImplementation(() => ok(null, 204));
		const timeline_event = {
			event_title: 'IOC beacons to asset',
			event_date: '2026-10-30T14:05:00.000',
			event_tz: '+00:00',
			event_category_id: 1
		};
		await s.createEdge({
			source: 'ioc:3',
			target: 'asset:1',
			relation: 'beacons_to',
			event_ids: [5],
			timeline_event
		});
		await s.undo();
		await s.redo();
		expect(svc.createEdge).toHaveBeenLastCalledWith(7, {
			source: 'ioc:3',
			target: 'asset:1',
			relation: 'beacons_to',
			event_ids: [5, 90]
		});
	});

	it('restores the previous values when undoing an edit', async () => {
		const s = await makeState();
		svc.updateEdge.mockImplementation(() => ok(edge('node:4', 'asset:1', { id: 11 })));
		const e = s.edge('e:11') as GraphEdge;
		await s.updateEdge(e, { label: 'owns', confidence: 80 });
		expect(svc.updateEdge).toHaveBeenLastCalledWith(7, 11, { label: 'owns', confidence: 80 });
		await s.undo();
		expect(svc.updateEdge).toHaveBeenLastCalledWith(7, 11, { label: 'targets', confidence: null });
	});

	it('recreates deleted edges on undo', async () => {
		const s = await makeState();
		svc.deleteEdge.mockImplementation(() => ok(null, 204));
		svc.createEdge.mockImplementation(() => ok(edge('node:4', 'asset:1', { id: 30 }), 201));
		await s.deleteEdges([s.edge('e:11') as GraphEdge]);
		expect(svc.deleteEdge).toHaveBeenCalledWith(7, 11);
		await s.undo();
		expect(svc.createEdge).toHaveBeenCalledWith(
			7,
			expect.objectContaining({
				source: 'node:4',
				target: 'asset:1',
				relation_type_id: 1,
				label: 'targets'
			})
		);
		await s.redo();
		expect(svc.deleteEdge).toHaveBeenLastCalledWith(7, 30);
	});

	it('materialises a derived edge with its events', async () => {
		const s = await makeState();
		svc.createEdge.mockImplementation(() => ok(edge('ioc:2', 'ioc:3', { id: 40 }), 201));
		await s.materialiseEdge(edge('ioc:2', 'ioc:3', { event_ids: [5, 6], directed: false }));
		expect(svc.createEdge).toHaveBeenCalledWith(7, {
			source: 'ioc:2',
			target: 'ioc:3',
			relation: 'connected_to',
			directed: false,
			event_ids: [5, 6]
		});
	});

	it('refuses to edit derived edges', async () => {
		const s = await makeState();
		await expect(s.updateEdge(edge('ioc:2', 'ioc:3'), { label: 'x' })).rejects.toThrow();
		expect(svc.updateEdge).not.toHaveBeenCalled();
	});

	it('reverts a review to the previous state', async () => {
		const s = await makeState();
		svc.reviewEdge.mockImplementation(() => ok(edge('a:1', 'b:2', { id: 11 })));
		svc.updateEdge.mockImplementation(() => ok(edge('a:1', 'b:2', { id: 11 })));
		await s.reviewEdge({ ...(s.edge('e:11') as GraphEdge), review_state: 'pending' }, 'accept');
		await s.undo();
		expect(svc.updateEdge).toHaveBeenCalledWith(7, 11, { review_state: 'pending' });
	});

	it('deletes a free node and restores it with its edges', async () => {
		const s = await makeState();
		svc.deleteNode.mockImplementation(() => ok(null, 204));
		svc.createNode.mockImplementation(() => ok(node('node:50', { label: 'APT' }), 201));
		svc.createEdge.mockImplementation(() => ok(edge('node:50', 'asset:1', { id: 60 }), 201));
		s.togglePin(['node:4']);
		await s.deleteFreeNode(s.node('node:4') as never);
		expect(svc.deleteNode).toHaveBeenCalledWith(7, 4);
		await s.undo();
		expect(svc.createNode).toHaveBeenCalledWith(
			7,
			expect.objectContaining({ label: 'APT', node_type: 'actor' })
		);
		expect(svc.createEdge).toHaveBeenCalledWith(
			7,
			expect.objectContaining({ source: 'node:50', target: 'asset:1' })
		);
		expect(s.pinned.has('node:50')).toBe(true);
		await s.redo();
		expect(svc.deleteNode).toHaveBeenLastCalledWith(7, 50);
	});

	it('pastes indicators, puts them on the canvas and undoes the creations', async () => {
		const s = await makeState();
		svc.paste.mockImplementation(() =>
			ok({
				created: ['ioc:70'],
				existing: ['ioc:3'],
				edges: [edge('ioc:70', 'asset:1', { id: 80 })],
				ignored: ['junk']
			})
		);
		svc.deleteEdge.mockImplementation(() => ok(null, 204));
		iocs.remove.mockImplementation(() => ok(null, 204));
		const res = await s.paste({
			text: '1.2.3.4 evil.com',
			link_to: 'asset:1',
			relation: 'connected_to'
		});
		expect(res.ignored).toEqual(['junk']);
		expect(s.extraNodes.has('ioc:70')).toBe(true);
		expect(s.extraNodes.has('ioc:3')).toBe(true);
		await s.undo();
		expect(svc.deleteEdge).toHaveBeenCalledWith(7, 80);
		expect(iocs.remove).toHaveBeenCalledWith(7, 70);
	});

	it('adds tags and restores the previous ones on undo', async () => {
		const s = await makeState();
		assets.update.mockImplementation(() => ok({}));
		iocs.update.mockImplementation(() => ok({}));
		expect(await s.addTags(['asset:1', 'ioc:2', 'node:4'], ['c2', 'dc'])).toBe(2);
		expect(assets.update).toHaveBeenCalledWith(7, 1, { asset_tags: 'dc,c2' });
		expect(iocs.update).toHaveBeenCalledWith(7, 2, { ioc_tags: 'c2,dc' });
		await s.undo();
		expect(assets.update).toHaveBeenLastCalledWith(7, 1, { asset_tags: 'dc' });
		expect(iocs.update).toHaveBeenLastCalledWith(7, 2, { ioc_tags: '' });
	});

	it('flags assets and clears the flag on undo', async () => {
		const s = await makeState();
		flags.setAssetFlag.mockImplementation(() => ok({}));
		flags.clearAssetFlag.mockImplementation(() => ok({}));
		expect(await s.flagAssets(['asset:1', 'ioc:2'], 3, 'contained')).toBe(1);
		expect(flags.setAssetFlag).toHaveBeenCalledWith(7, 1, 3, { reason: 'contained' });
		await s.undo();
		expect(flags.clearAssetFlag).toHaveBeenCalledWith(7, 1, 3);
	});

	it('surfaces API errors and keeps the history untouched', async () => {
		const s = await makeState();
		svc.createEdge.mockImplementation(() => fail('Relation type not found'));
		await expect(
			s.createEdge({ source: 'ioc:2', target: 'ioc:3', relation: 'nope' })
		).rejects.toThrow('Relation type not found');
		expect(s.canUndo).toBe(false);
	});

	it('aliases a promoted node to its new key', async () => {
		const s = await makeState();
		svc.promoteNode.mockImplementation(() => ok({ key: 'asset:90', node: node('asset:90') }));
		s.togglePin(['node:4']);
		s.rail = { type: 'node', key: 'node:4' };
		await s.promoteFreeNode(s.node('node:4') as never, { kind: 'asset', asset_type_id: 1 });
		expect(s.pinned.has('asset:90')).toBe(true);
		expect(s.resolveKey('node:4')).toBe('asset:90');
		expect(s.rail).toEqual({ type: 'node', key: 'asset:90' });
		flushSync();
	});
});

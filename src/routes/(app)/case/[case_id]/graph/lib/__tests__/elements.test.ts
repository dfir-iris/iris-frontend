import { describe, expect, it } from 'vitest';
import {
	buildElements,
	computeVisibility,
	DEFAULT_OVERLAYS,
	fanoutCandidates,
	leafIocs,
	overlaySvg,
	type ElementsInput,
	type VisibilityInput
} from '../elements';
import type { CyEdgeDef, CyNodeDef } from '$lib/components/common/CytoscapeGraph/types';
import type { GraphEdge, GraphNode } from '$lib/types/resources/case-graph';
import { edge, node } from './fixtures';

const vis = (nodes: GraphNode[], edges: GraphEdge[], extra: Partial<VisibilityInput> = {}) =>
	computeVisibility({
		nodes,
		edges,
		hidden: new Set(),
		extraNodes: new Set(),
		showUnlinked: false,
		showPending: true,
		showRejected: false,
		focus: null,
		...extra
	});

const build = (nodes: GraphNode[], edges: GraphEdge[], extra: Partial<ElementsInput> = {}) =>
	buildElements({
		nodes,
		edges,
		visibility: vis(nodes, edges),
		pinned: new Set(),
		positions: {},
		bundleEdges: true,
		expandedBundles: new Set(),
		fanoutThreshold: 8,
		expandedFanouts: new Set(),
		forcedFanouts: new Set(),
		overlays: { ...DEFAULT_OVERLAYS },
		isDark: false,
		...extra
	});

const byId = (out: ReturnType<typeof build>, id: string) =>
	out.elements.find((e) => e.data.id === id) as CyNodeDef | CyEdgeDef | undefined;

describe('computeVisibility', () => {
	const nodes = [node('asset:1'), node('ioc:2'), node('ioc:3'), node('node:4'), node('event:5')];
	const edges = [
		edge('asset:1', 'ioc:2', { id: 1 }),
		edge('node:4', 'event:5', { id: 2, review_state: 'rejected' })
	];

	it('puts unlinked assets / IOCs off-canvas but keeps other kinds', () => {
		const v = vis(nodes, edges);
		expect([...v.nodes].sort()).toEqual(['asset:1', 'event:5', 'ioc:2', 'node:4']);
		expect([...v.offCanvas]).toEqual(['ioc:3']);
		expect(v.edges.has('e:2')).toBe(false);
	});

	it('honours showUnlinked, extraNodes and hidden', () => {
		expect(vis(nodes, edges, { showUnlinked: true }).nodes.has('ioc:3')).toBe(true);
		expect(vis(nodes, edges, { extraNodes: new Set(['ioc:3']) }).offCanvas.size).toBe(0);
		const hidden = vis(nodes, edges, { hidden: new Set(['ioc:2', 'node:4']) });
		expect(hidden.nodes.has('node:4')).toBe(false);
		expect(hidden.offCanvas.has('ioc:2')).toBe(true);
		expect(hidden.offCanvas.has('node:4')).toBe(false);
		// asset:1 lost its only edge
		expect(hidden.offCanvas.has('asset:1')).toBe(true);
	});

	it('filters pending / rejected edges and applies hooks', () => {
		const pend = [edge('asset:1', 'ioc:2', { id: 7, review_state: 'pending' })];
		expect(vis(nodes, pend).edges.has('e:7')).toBe(true);
		expect(vis(nodes, pend, { showPending: false }).edges.size).toBe(0);
		expect(vis(nodes, edges, { showRejected: true }).edges.has('e:2')).toBe(true);
		const v = vis(nodes, edges, { nodeFilter: (n) => n.kind !== 'event' });
		expect(v.nodes.has('event:5')).toBe(false);
		expect(vis(nodes, edges, { edgeFilter: () => false }).nodes.has('asset:1')).toBe(false);
	});

	it('limits focus mode to N hops', () => {
		const chain = [node('node:1'), node('node:2'), node('node:3'), node('node:4')];
		const links = [
			edge('node:1', 'node:2', { id: 1 }),
			edge('node:2', 'node:3', { id: 2 }),
			edge('node:3', 'node:4', { id: 3 })
		];
		const one = vis(chain, links, { focus: { key: 'node:2', hops: 1 } });
		expect([...one.nodes].sort()).toEqual(['node:1', 'node:2', 'node:3']);
		expect(one.edges.has('e:3')).toBe(false);
		const two = vis(chain, links, { focus: { key: 'node:1', hops: 2 } });
		expect(two.nodes.has('node:4')).toBe(false);
		expect(two.nodes.has('node:3')).toBe(true);
	});
});

describe('overlaySvg', () => {
	it('returns null without overlays and draws each badge otherwise', () => {
		const base = {
			flags: [],
			status: null,
			tlp: null,
			score: null,
			crossCase: null,
			isDark: false
		};
		expect(overlaySvg(base)).toBeNull();
		const svg = overlaySvg({
			...base,
			flags: ['#f00', '#0f0', '#00f', '#ff0', '#0ff'],
			status: '#123',
			tlp: '#456',
			score: 82.4,
			crossCase: 150
		}) as string;
		expect((svg.match(/<circle/g) ?? []).length).toBe(4 + 1 + 1 + 1);
		expect(svg).toContain('>82<');
		expect(svg).toContain('>99+<');
	});

	it('escapes colours', () => {
		const svg = overlaySvg({
			flags: ['"><script>'],
			status: null,
			tlp: null,
			score: null,
			crossCase: null,
			isDark: false
		}) as string;
		expect(svg).not.toContain('<script>');
	});
});

describe('fan-outs', () => {
	const asset = node('asset:1');
	const iocs = Array.from({ length: 4 }, (_, i) => node(`ioc:${i + 10}`));
	const shared = node('ioc:20');
	const other = node('asset:2');
	const nodes = [asset, ...iocs, shared, other];
	const edges = [
		...iocs.map((n, i) => edge('asset:1', n.key, { id: i + 1 })),
		edge('asset:1', 'ioc:20', { id: 50 }),
		edge('asset:2', 'ioc:20', { id: 51 })
	];
	const map = new Map(nodes.map((n) => [n.key, n]));

	it('finds IOC leaves and folds above the threshold', () => {
		expect(leafIocs(map, edges).get('asset:1')).toEqual(['ioc:10', 'ioc:11', 'ioc:12', 'ioc:13']);
		expect(fanoutCandidates(map, edges, 4, new Set()).size).toBe(0);
		expect(fanoutCandidates(map, edges, 3, new Set()).get('asset:1')).toHaveLength(4);
		expect(fanoutCandidates(map, edges, 3, new Set(['asset:1'])).size).toBe(0);
		expect(fanoutCandidates(map, edges, 0, new Set(), new Set(['asset:2']))).toEqual(new Map());
		expect(fanoutCandidates(map, edges, 0, new Set(), new Set(['asset:1'])).size).toBe(1);
	});

	it('replaces folded IOCs by a badge node and edge', () => {
		const out = build(nodes, edges, { fanoutThreshold: 3 });
		expect(byId(out, 'ioc:10')).toBeUndefined();
		const fan = byId(out, 'fan:asset:1');
		expect(fan?.data.label).toBe('4 IOCs');
		expect(fan?.data.members).toHaveLength(4);
		expect(byId(out, 'fan:asset:1>')?.data.source).toBe('asset:1');
		expect(byId(out, 'ioc:20')).toBeDefined();
		expect(out.fanouts.get('fan:asset:1')?.iocs).toHaveLength(4);
	});
});

describe('buildElements', () => {
	const nodes = [
		node('asset:1', {
			compromised: true,
			criticality: 'critical',
			flags: [{ id: 1, name: 'Isolated', color: 'red', kind: 'status' }]
		}),
		node('ioc:2'),
		node('node:3', { color: 'violet', label: 'A very long free node label that is truncated' })
	];

	it('styles edges by origin, direction, count and review state', () => {
		const edges = [
			edge('asset:1', 'ioc:2', { id: 1, count: 4 }),
			edge('ioc:2', 'node:3', { directed: false }),
			edge('asset:1', 'node:3', { id: 3, review_state: 'pending', origin: 'ai' })
		];
		const out = build(nodes, edges);
		const stored = byId(out, 'e:1');
		expect(stored?.data.lineStyle).toBe('solid');
		expect(stored?.data.arrow).toBe('triangle');
		expect(stored?.data.width).toBeGreaterThan(1.5);
		expect(stored?.data.label).toBe('Connected to');
		const derived = out.elements.find((e) => (e.classes as string[]).includes('derived'));
		expect(derived?.data.lineStyle).toBe('dashed');
		expect(derived?.data.arrow).toBe('none');
		const pending = byId(out, 'e:3');
		expect(pending?.data.lineStyle).toBe('dotted');
		expect(pending?.classes).toContain('pending');
	});

	it('bundles parallel edges unless expanded or disabled', () => {
		const edges = [
			edge('asset:1', 'ioc:2', { id: 1 }),
			edge('ioc:2', 'asset:1', { id: 2, count: 3 })
		];
		const out = build(nodes, edges);
		const bundleId = [...out.bundles.keys()][0];
		expect(out.bundles.get(bundleId)).toEqual(['e:1', 'e:2']);
		expect(byId(out, bundleId)?.data.label).toBe('2 relations');
		expect(byId(out, 'e:1')).toBeUndefined();
		expect(build(nodes, edges, { expandedBundles: new Set([bundleId]) }).bundles.size).toBe(0);
		expect(build(nodes, edges, { bundleEdges: false }).bundles.size).toBe(0);
	});

	it('draws node overlays and classes', () => {
		const edges = [edge('asset:1', 'ioc:2', { id: 1 }), edge('ioc:2', 'node:3', { id: 2 })];
		const out = build(nodes, edges, {
			pinned: new Set(['asset:1']),
			positions: { 'asset:1': { x: 5, y: 6 } }
		});
		const a = byId(out, 'asset:1') as CyNodeDef;
		expect(a.data.borderWidth).toBe(4);
		expect(a.data.bg).toBeDefined();
		expect(a.data.outlineColor).toBeDefined();
		expect((a.data.images as string[]).length).toBe(2);
		expect(a.classes).toContain('pinned');
		expect(a.position).toEqual({ x: 5, y: 6 });
		const free = byId(out, 'node:3') as CyNodeDef;
		expect((free.data.label as string).length).toBeLessThanOrEqual(30);
		expect(free.data.fullLabel).toContain('truncated');

		const plain = byId(
			build(nodes, edges, {
				overlays: { ...DEFAULT_OVERLAYS, compromise: false, flags: false, criticality: false }
			}),
			'asset:1'
		) as CyNodeDef;
		expect(plain.data.borderWidth).toBe(2);
		expect(plain.data.outlineColor).toBeUndefined();
		expect((plain.data.images as string[]).length).toBe(1);
	});

	it('marks path highlights and search hits', () => {
		const edges = [edge('asset:1', 'ioc:2', { id: 1 }), edge('ioc:2', 'node:3', { id: 2 })];
		const path = build(nodes, edges, {
			highlight: { nodes: new Set(['asset:1', 'ioc:2']), edges: new Set(['e:1']) }
		});
		expect(byId(path, 'asset:1')?.classes).toContain('highlighted');
		expect(byId(path, 'node:3')?.classes).toContain('dimmed');
		expect(byId(path, 'e:1')?.classes).toContain('highlighted');
		expect(byId(path, 'e:2')?.classes).toContain('dimmed');

		const search = build(nodes, edges, { matches: new Set(['ioc:2']), activeMatch: 'ioc:2' });
		expect(byId(search, 'ioc:2')?.classes).toEqual(
			expect.arrayContaining(['search-hit', 'active-match'])
		);
		expect(byId(search, 'asset:1')?.classes).toContain('dimmed');
	});
});

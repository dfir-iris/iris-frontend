import { describe, expect, it } from 'vitest';
import type { CyElementDef } from '$lib/components/common/CytoscapeGraph/types';
import type { GraphEdge, GraphNode, WarRoomGraph } from '$lib/types/resources/case-graph';
import {
	buildWarRoomElements,
	caseColor,
	caseIdOfElement,
	isSameAsEdge,
	isStoredWarRoomEdge,
	parseWarRoomKey,
	sameAsCounterparts,
	searchWarRoomNodes,
	warRoomCases,
	warRoomEdgeEventsUrl,
	warRoomGraphStylesheet,
	warRoomNodeLinks
} from '../war-room-graph';

const caseNode = (id: number, accessible = true): GraphNode => ({
	key: `case:${id}`,
	kind: 'case',
	id,
	label: accessible ? `Case ${id}` : 'Restricted case',
	accessible,
	url: accessible ? `/case/${id}` : null
});

const obj = (caseId: number, local: string, extra: Partial<GraphNode> = {}): GraphNode => {
	const [kind, id] = local.split(':');
	return {
		key: `c${caseId}/${local}`,
		kind: kind as GraphNode['kind'],
		id: Number(id),
		label: local,
		case_id: caseId,
		url: `/case/${caseId}/${kind}s/${id}`,
		...extra
	};
};

const edge = (key: string, source: string, target: string, extra: Partial<GraphEdge> = {}) =>
	({
		key,
		id: null,
		source,
		target,
		relation: {
			id: 1,
			name: 'connected_to',
			label: 'Connected to',
			color: 'slate',
			line_style: 'dashed'
		},
		directed: true,
		label: null,
		description: null,
		confidence: null,
		tlp: null,
		origin: 'event',
		review_state: 'accepted',
		first_seen: null,
		last_seen: null,
		event_ids: [],
		count: 1,
		editable: false,
		case_id: caseIdOfElement(key),
		...extra
	}) as GraphEdge;

const sameAs = (source: string, target: string) =>
	edge(`d:same_as:${source}|${target}`, source, target, {
		relation: { id: 9, name: 'same_as', label: 'Same as', color: 'slate', line_style: 'dashed' },
		directed: false,
		origin: 'cross_case',
		case_id: undefined
	});

const graphOf = (
	nodes: GraphNode[],
	edges: GraphEdge[],
	meta: Partial<WarRoomGraph['meta']> = {}
): WarRoomGraph => ({
	nodes,
	edges,
	events: [],
	relation_types: [],
	suggestions: [],
	meta: { node_count: nodes.length, edge_count: edges.length, generated_at: '', ...meta }
});

const fixture = () =>
	graphOf(
		[
			caseNode(5),
			caseNode(6),
			caseNode(7, false),
			obj(5, 'asset:1'),
			obj(5, 'ioc:2', { label: '1.2.3.4', subtitle: 'ip-dst' }),
			obj(6, 'ioc:9', { label: '1.2.3.4' }),
			obj(6, 'asset:3', { label: 'DC01' })
		],
		[
			edge('c5/e:4', 'c5/asset:1', 'c5/ioc:2', { id: 4, origin: 'manual', editable: true }),
			edge('c6/d:x', 'c6/asset:3', 'c6/ioc:9', { event_ids: [11, 12] }),
			sameAs('c5/ioc:2', 'c6/ioc:9')
		],
		{ case_ids: [5, 6, 7], readable_case_ids: [5, 6] }
	);

const find = (els: ReturnType<typeof buildWarRoomElements>['elements'], id: string) =>
	els.find((e) => e.data.id === id) as CyElementDef | undefined;

describe('keys', () => {
	it('parses prefixed and case keys', () => {
		expect(parseWarRoomKey('c5/asset:12')).toEqual({
			caseId: 5,
			kind: 'asset',
			localKey: 'asset:12',
			id: 12
		});
		expect(parseWarRoomKey('case:7')).toEqual({
			caseId: 7,
			kind: 'case',
			localKey: 'case:7',
			id: 7
		});
		expect(parseWarRoomKey('c5/d:same_as:x')?.id).toBeNull();
		expect(parseWarRoomKey('asset:12')).toBeNull();
	});

	it('finds the case of an element, folded IOC groups included', () => {
		expect(caseIdOfElement('c5/ioc:1')).toBe(5);
		expect(caseIdOfElement('fan:c12/asset:3')).toBe(12);
		expect(caseIdOfElement('d:same_as:c5/ioc:2|c6/ioc:9')).toBeNull();
	});

	it('tells stored and same_as edges', () => {
		expect(isStoredWarRoomEdge('c5/e:4')).toBe(true);
		expect(isStoredWarRoomEdge('c5/d:4')).toBe(false);
		expect(isSameAsEdge(sameAs('a', 'b'))).toBe(true);
		expect(isSameAsEdge(edge('c5/e:1', 'a', 'b'))).toBe(false);
	});
});

describe('warRoomCases', () => {
	it('lists the cases in attachment order with colours and counts', () => {
		const cases = warRoomCases(fixture());
		expect(cases.map((c) => [c.id, c.name, c.accessible, c.nodeCount])).toEqual([
			[5, 'Case 5', true, 2],
			[6, 'Case 6', true, 2],
			[7, 'Restricted case', false, 0]
		]);
		expect(cases.map((c) => c.color)).toEqual([caseColor(0), caseColor(1), caseColor(2)]);
	});

	it('locks a case missing from readable_case_ids even if its node says accessible', () => {
		const g = fixture();
		g.meta.readable_case_ids = [5];
		expect(warRoomCases(g).find((c) => c.id === 6)?.accessible).toBe(false);
	});

	it('falls back on the case nodes without meta.case_ids', () => {
		const g = graphOf([caseNode(3), caseNode(2, false)], []);
		expect(warRoomCases(g).map((c) => [c.id, c.accessible])).toEqual([
			[3, true],
			[2, false]
		]);
	});
});

describe('buildWarRoomElements', () => {
	it('nests objects in their case and puts case nodes first', () => {
		const { elements } = buildWarRoomElements({ graph: fixture(), isDark: false });
		expect(elements.slice(0, 3).map((e) => e.data.id)).toEqual(['case:5', 'case:6', 'case:7']);
		expect(find(elements, 'c5/asset:1')?.data.parent).toBe('case:5');
		expect(find(elements, 'c6/ioc:9')?.data.parent).toBe('case:6');
		expect(find(elements, 'case:5')?.classes).toContain('case-group');
		expect(find(elements, 'case:5')?.data.label).toBe('#5 Case 5');
	});

	it('locks restricted cases', () => {
		const { elements } = buildWarRoomElements({ graph: fixture(), isDark: true });
		const locked = find(elements, 'case:7');
		expect(locked?.classes).toContain('case-restricted');
		expect(locked?.data.label).toBe('Restricted case');
		expect(locked?.data.borderStyle).toBe('dashed');
		expect(locked?.data.locked).toBe(true);
	});

	it('draws same_as edges dashed and undirected, stored edges solid', () => {
		const { elements } = buildWarRoomElements({ graph: fixture(), isDark: false });
		const same = find(elements, 'd:same_as:c5/ioc:2|c6/ioc:9');
		expect(same?.classes).toContain('same-as');
		expect(same?.data.lineStyle).toBe('dashed');
		expect(same?.data.arrow).toBe('none');
		expect(same?.data.label).toBe('same as');
		const stored = find(elements, 'c5/e:4');
		expect(stored?.classes).toContain('stored');
		expect(stored?.data.lineStyle).toBe('solid');
		expect(find(elements, 'c6/d:x')?.data.lineStyle).toBe('dashed');
	});

	it('drops the objects of hidden cases and the edges to them', () => {
		const { elements } = buildWarRoomElements({
			graph: fixture(),
			isDark: false,
			hiddenCases: new Set([6])
		});
		expect(find(elements, 'c6/ioc:9')).toBeUndefined();
		expect(find(elements, 'd:same_as:c5/ioc:2|c6/ioc:9')).toBeUndefined();
		expect(find(elements, 'case:6')).toBeDefined();
	});

	it('never draws objects of a restricted case', () => {
		const g = fixture();
		g.nodes.push(obj(7, 'asset:8'));
		const { elements } = buildWarRoomElements({ graph: g, isDark: false });
		expect(find(elements, 'c7/asset:8')).toBeUndefined();
	});

	it('gives folded IOCs the parent of their asset', () => {
		const iocs = [1, 2, 3].map((i) => obj(5, `ioc:${i + 20}`));
		const g = graphOf(
			[caseNode(5), obj(5, 'asset:1'), ...iocs],
			iocs.map((i, n) => edge(`c5/d:${n}`, 'c5/asset:1', i.key)),
			{ case_ids: [5], readable_case_ids: [5] }
		);
		const { elements, fanouts } = buildWarRoomElements({
			graph: g,
			isDark: false,
			fanoutThreshold: 2
		});
		expect(fanouts.size).toBe(1);
		expect(find(elements, 'fan:c5/asset:1')?.data.parent).toBe('case:5');
	});

	it('styles the case groups', () => {
		const selectors = warRoomGraphStylesheet(false).map((r) => r.selector);
		expect(selectors).toEqual(
			expect.arrayContaining(['node.case-group', 'node.case-restricted', 'edge.same-as'])
		);
	});
});

describe('details', () => {
	it('walks a same_as star from any member', () => {
		const g = fixture();
		g.nodes.push(obj(8, 'ioc:4', { label: '1.2.3.4' }));
		g.edges.push(sameAs('c5/ioc:2', 'c8/ioc:4'));
		expect(
			sameAsCounterparts(g, 'c6/ioc:9')
				.map((n) => n.key)
				.sort()
		).toEqual(['c5/ioc:2', 'c8/ioc:4']);
		expect(sameAsCounterparts(g, 'c5/asset:1')).toEqual([]);
	});

	it('links a node to its object and its case graph', () => {
		expect(warRoomNodeLinks(obj(5, 'asset:1'))).toEqual({
			object: '/case/5/assets/1',
			caseGraph: '/case/5/graph?focus=asset:1'
		});
		expect(warRoomNodeLinks(caseNode(5))).toEqual({
			object: '/case/5',
			caseGraph: '/case/5/graph'
		});
		expect(warRoomNodeLinks(caseNode(7, false))).toEqual({ object: null, caseGraph: null });
		expect(warRoomNodeLinks(caseNode(5), false).object).toBeNull();
	});

	it('links a case edge to its events', () => {
		const [, events, same] = fixture().edges;
		expect(warRoomEdgeEventsUrl(events)).toBe('/case/6/timeline?events=11,12');
		expect(warRoomEdgeEventsUrl(same)).toBeNull();
		expect(warRoomEdgeEventsUrl(edge('c5/e:1', 'a', 'b'))).toBeNull();
	});

	it('searches labels, subtitles and types', () => {
		const nodes = fixture().nodes;
		expect(searchWarRoomNodes(nodes, '  ')).toBeNull();
		expect([...(searchWarRoomNodes(nodes, '1.2.3') ?? [])].sort()).toEqual([
			'c5/ioc:2',
			'c6/ioc:9'
		]);
		expect([...(searchWarRoomNodes(nodes, 'IP-DST') ?? [])]).toEqual(['c5/ioc:2']);
		expect(searchWarRoomNodes(nodes, 'restricted')?.size).toBe(0);
	});
});

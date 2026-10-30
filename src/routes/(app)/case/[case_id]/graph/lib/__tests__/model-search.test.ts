import { describe, expect, it } from 'vitest';
import {
	analysisStatusColor,
	buildIndex,
	edgeLineStyle,
	edgeWidth,
	isLinkable,
	isStoredEdge,
	mergeByKey,
	pairKey,
	parseNodeKey,
	timelineEventUrl,
	toTime,
	truncate
} from '../model';
import { cycleIndex, nodeMatchesQuery, parseGraphQuery, searchNodes } from '../search';
import { lucideSvgFor, nodeImage, FREE_NODE_ICONS } from '../icons';
import { edge, node } from './fixtures';

describe('model', () => {
	it('indexes nodes, edges and undirected adjacency, skipping dangling edges', () => {
		const idx = buildIndex(
			[node('asset:1'), node('ioc:2'), node('node:3')],
			[
				edge('asset:1', 'ioc:2', { id: 1 }),
				edge('ioc:2', 'node:3'),
				edge('asset:1', 'asset:99', { id: 2 }),
				edge('asset:1', 'asset:1', { id: 3 })
			]
		);
		expect(idx.edges.size).toBe(3);
		expect([...(idx.adjacency.get('ioc:2') ?? [])].sort()).toEqual(['asset:1', 'node:3']);
		expect(idx.adjacency.get('asset:1')?.has('asset:1')).toBe(false);
		expect(idx.edgesOf.get('asset:1')).toEqual(['e:1', 'e:3']);
	});

	it('merges lists by key, later lists winning', () => {
		const merged = mergeByKey(
			[node('asset:1', { label: 'old' })],
			[node('asset:1', { label: 'new' })]
		);
		expect(merged).toHaveLength(1);
		expect(merged[0].label).toBe('new');
	});

	it('builds order-independent pair keys and parses node keys', () => {
		expect(pairKey('b', 'a')).toBe(pairKey('a', 'b'));
		expect(parseNodeKey('asset:12')).toEqual({ kind: 'asset', id: 12 });
		expect(parseNodeKey('c3/asset:12')).toBeNull();
		expect(parseNodeKey('fan:asset:1')).toBeNull();
	});

	it('picks the line style by origin and review state', () => {
		expect(edgeLineStyle(edge('a:1', 'b:2', { id: 4 }))).toBe('solid');
		expect(edgeLineStyle(edge('a:1', 'b:2'))).toBe('dashed');
		expect(
			edgeLineStyle(edge('a:1', 'b:2', { id: 5, origin: 'ai', review_state: 'pending' }))
		).toBe('dotted');
		expect(isStoredEdge(edge('a:1', 'b:2', { id: 9 }))).toBe(true);
		expect(isStoredEdge(edge('a:1', 'b:2'))).toBe(false);
	});

	it('grows the edge width with the event count, capped', () => {
		expect(edgeWidth(1)).toBe(1.5);
		expect(edgeWidth(null)).toBe(1.5);
		expect(edgeWidth(4)).toBeGreaterThan(edgeWidth(2));
		expect(edgeWidth(1_000_000)).toBe(7);
	});

	it('handles the small helpers', () => {
		expect(isLinkable(node('case:1'))).toBe(false);
		expect(isLinkable(node('asset:1', { accessible: false }))).toBe(false);
		expect(isLinkable(node('event:1'))).toBe(true);
		expect(analysisStatusColor('Done')).toBe('green');
		expect(analysisStatusColor('Unspecified')).toBeNull();
		expect(toTime('2024-01-01T00:00:00')).toBe(Date.UTC(2024, 0, 1));
		expect(toTime('2024-01-01T01:00:00+01:00')).toBe(Date.UTC(2024, 0, 1));
		expect(toTime('nope')).toBeNull();
		expect(timelineEventUrl(3, 9)).toBe('/case/3/timeline?sharedEventId=9');
		expect(truncate('abcdef', 4)).toBe('abc…');
		expect(truncate('abc', 4)).toBe('abc');
	});
});

describe('graph search', () => {
	const nodes = [
		node('asset:1', {
			label: 'DC01',
			type: 'Windows - DC',
			compromised: true,
			tags: ['crown-jewel'],
			flags: [{ id: 1, name: 'Isolated', color: 'red', kind: 'status' }],
			criticality: 'High',
			analysis_status: 'Started'
		}),
		node('asset:2', { label: 'WKS-7', type: 'Windows - Computer', compromised: false }),
		node('ioc:3', { label: '10.0.0.5', type: 'ip-dst', tags: ['C2'], tlp: 'amber' }),
		node('ioc:4', { label: 'evil.example', type: 'domain', description: 'phishing infra' }),
		node('node:5', { label: 'APT-X', type: 'actor' })
	];

	it('parses the attribute grammar with negation and free text', () => {
		const q = parseGraphQuery('kind:ioc -tag:c2 "two words" Foo unknown:x');
		expect(q.terms).toEqual([
			{ key: 'kind', value: 'ioc', negated: false },
			{ key: 'tag', value: 'c2', negated: true }
		]);
		expect(q.text).toEqual(['two words', 'foo', 'unknown:x']);
	});

	it('matches each key', () => {
		const m = (input: string) => searchNodes(nodes, input);
		expect(m('kind:ioc')).toEqual(['ioc:3', 'ioc:4']);
		expect(m('kind:free')).toEqual(['node:5']);
		expect(m('type:ip')).toEqual(['ioc:3']);
		expect(m('tag:c2')).toEqual(['ioc:3']);
		expect(m('tag:c')).toEqual([]);
		expect(m('compromised:true')).toEqual(['asset:1']);
		expect(m('kind:asset compromised:no')).toEqual(['asset:2']);
		expect(m('flag:isol')).toEqual(['asset:1']);
		expect(m('tlp:TLP:AMBER')).toEqual(['ioc:3']);
		expect(m('criticality:high')).toEqual(['asset:1']);
		expect(m('status:start')).toEqual(['asset:1']);
		expect(m('label:wks')).toEqual(['asset:2']);
		expect(m('-kind:asset -kind:ioc')).toEqual(['node:5']);
	});

	it('searches free text over label, type, description and tags', () => {
		expect(searchNodes(nodes, 'phishing')).toEqual(['ioc:4']);
		expect(searchNodes(nodes, 'windows dc01')).toEqual(['asset:1']);
		expect(searchNodes(nodes, 'crown')).toEqual(['asset:1']);
		expect(searchNodes(nodes, '   ')).toBeNull();
	});

	it('requires every term', () => {
		expect(
			nodeMatchesQuery(nodes[0], parseGraphQuery('kind:asset compromised:true flag:isolated'))
		).toBe(true);
		expect(nodeMatchesQuery(nodes[0], parseGraphQuery('kind:asset compromised:maybe'))).toBe(false);
	});

	it('cycles through matches both ways', () => {
		expect(cycleIndex(-1, 3)).toBe(0);
		expect(cycleIndex(-1, 3, true)).toBe(2);
		expect(cycleIndex(2, 3)).toBe(0);
		expect(cycleIndex(0, 3, true)).toBe(2);
		expect(cycleIndex(5, 3)).toBe(0);
		expect(cycleIndex(0, 0)).toBe(-1);
	});
});

describe('node icons', () => {
	it('uses the free node icon, then its type icon, then a default', () => {
		expect(lucideSvgFor({ kind: 'node', icon: 'bug', type: 'actor' })).toBe(FREE_NODE_ICONS.bug);
		expect(lucideSvgFor({ kind: 'node', icon: 'not-an-icon', type: 'actor' })).toBe(
			FREE_NODE_ICONS.skull
		);
		expect(lucideSvgFor({ kind: 'event' })).toContain('<svg');
	});

	it('keeps the asset type icon and colours lucide icons', () => {
		const asset = nodeImage(
			{ kind: 'asset', icon: '/static/assets/img/graph/windows_pc.png' },
			'#000',
			false
		);
		expect(asset.scale).toBeGreaterThan(0.6);
		const ioc = nodeImage({ kind: 'ioc' }, '#123456', false);
		expect(ioc.url.startsWith('data:image/svg+xml')).toBe(true);
		expect(decodeURIComponent(ioc.url)).toContain('#123456');
	});
});

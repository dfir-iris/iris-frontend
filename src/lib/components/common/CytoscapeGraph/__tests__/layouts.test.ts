import { describe, expect, it } from 'vitest';
import cytoscape from 'cytoscape';
import {
	chronologicalPositions,
	gridPositions,
	groupedGridPositions,
	radialPositions,
	runLayout,
	withinHops
} from '../layouts';

const adj = (pairs: [string, string][]) => {
	const m = new Map<string, Set<string>>();
	for (const [a, b] of pairs) {
		m.set(a, (m.get(a) ?? new Set()).add(b));
		m.set(b, (m.get(b) ?? new Set()).add(a));
	}
	return m;
};

describe('chronologicalPositions', () => {
	it('maps time to x and puts undated nodes left of the band', () => {
		const p = chronologicalPositions(
			[
				{ id: 'late', time: 2000 },
				{ id: 'early', time: 1000 },
				{ id: 'none', time: null }
			],
			{ width: 1000, undatedGap: 200 }
		);
		expect(p.early.x).toBe(0);
		expect(p.late.x).toBe(1000);
		expect(p.none.x).toBe(-200);
	});

	it('stacks colliding nodes in a column centred on y = 0', () => {
		const p = chronologicalPositions(
			[
				{ id: 'a', time: 1000 },
				{ id: 'b', time: 1001 },
				{ id: 'c', time: 5000 }
			],
			{ width: 1000, rowGap: 80, minColumnGap: 90 }
		);
		expect(p.a.x).toBe(p.b.x);
		expect([p.a.y, p.b.y].sort((x, y) => x - y)).toEqual([-40, 40]);
		expect(p.c.y).toBe(0);
	});

	it('keeps a minimum gap between columns', () => {
		const p = chronologicalPositions(
			[
				{ id: 'a', time: 0 },
				{ id: 'b', time: 100 },
				{ id: 'c', time: 200 },
				{ id: 'd', time: 10000 }
			],
			{ width: 1000, minColumnGap: 90 }
		);
		const xs = [...new Set(Object.values(p).map((v) => v.x))].sort((x, y) => x - y);
		for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(90);
	});
});

describe('radialPositions', () => {
	it('places rings by hop distance', () => {
		const p = radialPositions(
			'c',
			['c', 'a', 'b', 'x', 'lonely'],
			adj([
				['c', 'a'],
				['c', 'b'],
				['a', 'x']
			]),
			{ radiusStep: 100, minArc: 1 }
		);
		const r = (id: string) => Math.hypot(p[id].x, p[id].y);
		expect(p.c).toEqual({ x: 0, y: 0 });
		expect(r('a')).toBeCloseTo(100);
		expect(r('b')).toBeCloseTo(100);
		expect(r('x')).toBeCloseTo(200);
		expect(r('lonely')).toBeCloseTo(300);
	});

	it('grows a crowded ring', () => {
		const ids = Array.from({ length: 50 }, (_, i) => `n${i}`);
		const p = radialPositions('c', ['c', ...ids], adj(ids.map((i) => ['c', i])), {
			radiusStep: 100,
			minArc: 70
		});
		expect(Math.hypot(p.n0.x, p.n0.y)).toBeCloseTo((50 * 70) / (2 * Math.PI));
	});
});

describe('groupedGridPositions', () => {
	it('orders groups by size and keeps them in separate blocks', () => {
		const { positions, groups } = groupedGridPositions(
			[
				{ id: 'a1', group: 'A' },
				{ id: 'b1', group: 'B' },
				{ id: 'b2', group: 'B' },
				{ id: 'b3', group: 'B' }
			],
			{ cell: 100, groupGap: 50 }
		);
		expect(groups.map((g) => g.group)).toEqual(['B', 'A']);
		expect(groups[0]).toMatchObject({ x: 0, y: 0, width: 200, height: 200, count: 3 });
		expect(groups[1].x).toBe(250);
		expect(positions.a1).toEqual({ x: 300, y: 50 });
		expect(positions.b1).toEqual({ x: 50, y: 50 });
	});

	it('wraps rows at maxRowWidth', () => {
		const { groups } = groupedGridPositions(
			[
				{ id: 'a', group: 'A' },
				{ id: 'b', group: 'B' },
				{ id: 'c', group: 'C' }
			],
			{ cell: 100, groupGap: 50, maxRowWidth: 260 }
		);
		expect(groups.map((g) => [g.x, g.y])).toEqual([
			[0, 0],
			[150, 0],
			[0, 150]
		]);
	});
});

describe('gridPositions / withinHops', () => {
	it('lays out row-major', () => {
		expect(gridPositions(['a', 'b', 'c', 'd'], 10)).toEqual({
			a: { x: 0, y: 0 },
			b: { x: 10, y: 0 },
			c: { x: 0, y: 10 },
			d: { x: 10, y: 10 }
		});
	});

	it('collects nodes within N hops', () => {
		const a = adj([
			['a', 'b'],
			['b', 'c'],
			['c', 'd']
		]);
		expect([...withinHops('a', a, 0)]).toEqual(['a']);
		expect([...withinHops('a', a, 2)].sort()).toEqual(['a', 'b', 'c']);
	});
});

describe('runLayout (headless)', () => {
	const build = () =>
		cytoscape({
			headless: true,
			styleEnabled: false,
			layout: { name: 'preset' },
			elements: [
				{ data: { id: 'a' }, position: { x: 0, y: 0 } },
				{ data: { id: 'b' }, position: { x: 0, y: 0 } },
				{ data: { id: 'c' }, position: { x: 0, y: 0 } },
				{ data: { id: 'p' }, position: { x: 999, y: 999 } },
				{ data: { id: 'ab', source: 'a', target: 'b' } }
			]
		});

	it('grid keeps pinned nodes in place', async () => {
		const cy = build();
		const out = await runLayout(cy, 'grid', {
			animate: false,
			fit: false,
			pinned: new Set(['p'])
		});
		expect(out.p).toEqual({ x: 999, y: 999 });
		const xs = new Set(['a', 'b', 'c'].map((id) => `${out[id].x},${out[id].y}`));
		expect(xs.size).toBe(3);
	});

	it('grouped puts same-group nodes together', async () => {
		const cy = build();
		const out = await runLayout(cy, 'grouped', {
			animate: false,
			fit: false,
			groupOf: (id) => (id === 'c' ? 'other' : 'main')
		});
		expect(Math.abs(out.a.y - out.b.y)).toBeLessThanOrEqual(110);
		expect(out.c.x).not.toBe(out.a.x);
	});

	it('radial defaults its centre to the highest degree node', async () => {
		const cy = build();
		const out = await runLayout(cy, 'radial', { animate: false, fit: false });
		const centre = out.a;
		expect(Math.hypot(out.b.x - centre.x, out.b.y - centre.y)).toBeGreaterThan(0);
	});

	it('preset applies the given positions', async () => {
		const cy = build();
		const out = await runLayout(cy, 'preset', {
			animate: false,
			fit: false,
			positions: { a: { x: 1, y: 2 }, b: { x: 3, y: 4 }, c: { x: 5, y: 6 }, p: { x: 7, y: 8 } }
		});
		expect(out.a).toEqual({ x: 1, y: 2 });
		expect(out.p).toEqual({ x: 7, y: 8 });
	});
});

import { describe, expect, it } from 'vitest';
import {
	histogram,
	overlaps,
	parseRange,
	replayDelay,
	replayFrame,
	replayOrder,
	spanOf,
	stepAt,
	timeBounds,
	toIso
} from '../time';
import { edge, node } from './fixtures';

const T = (iso: string) => Date.parse(iso);

describe('time helpers', () => {
	it('spanOf() handles single and inverted dates', () => {
		expect(spanOf({})).toBeNull();
		expect(spanOf({ first_seen: '2024-01-02T00:00:00Z' })).toEqual({
			start: T('2024-01-02T00:00:00Z'),
			end: T('2024-01-02T00:00:00Z')
		});
		expect(
			spanOf({ first_seen: '2024-01-03T00:00:00Z', last_seen: '2024-01-01T00:00:00Z' })
		).toEqual({ start: T('2024-01-01T00:00:00Z'), end: T('2024-01-03T00:00:00Z') });
		// No offset: UTC.
		expect(spanOf({ first_seen: '2024-01-02T00:00:00' })?.start).toBe(T('2024-01-02T00:00:00Z'));
	});

	it('timeBounds() spans nodes and edges, null when nothing is dated', () => {
		expect(timeBounds([node('asset:1')], [edge('asset:1', 'ioc:1')])).toBeNull();
		const b = timeBounds(
			[node('event:1', { first_seen: '2024-01-05T00:00:00Z' })],
			[
				edge('asset:1', 'ioc:1', {
					first_seen: '2024-01-02T00:00:00Z',
					last_seen: '2024-01-09T00:00:00Z'
				})
			]
		);
		expect(b).toEqual({ min: T('2024-01-02T00:00:00Z'), max: T('2024-01-09T00:00:00Z') });
	});

	it('overlaps() keeps undated objects and intersecting spans', () => {
		const r = { from: T('2024-01-05T00:00:00Z'), to: T('2024-01-06T00:00:00Z') };
		expect(overlaps({}, r)).toBe(true);
		expect(
			overlaps({ first_seen: '2024-01-01T00:00:00Z', last_seen: '2024-01-05T12:00:00Z' }, r)
		).toBe(true);
		expect(
			overlaps({ first_seen: '2024-01-01T00:00:00Z', last_seen: '2024-01-04T00:00:00Z' }, r)
		).toBe(false);
		expect(overlaps({ first_seen: '2024-01-07T00:00:00Z' }, r)).toBe(false);
		expect(overlaps({ first_seen: '2024-01-07T00:00:00Z' }, { from: r.from, to: null })).toBe(true);
	});

	it('parseRange() / toIso()', () => {
		expect(parseRange(null)).toBeNull();
		expect(parseRange({ from: null, to: null })).toBeNull();
		expect(parseRange({ from: '2024-01-01T00:00:00Z', to: null })).toEqual({
			from: T('2024-01-01T00:00:00Z'),
			to: null
		});
		expect(toIso(null)).toBeNull();
		expect(toIso(0)).toBe('1970-01-01T00:00:00.000Z');
	});

	describe('replay', () => {
		const a = edge('asset:1', 'ioc:1', { id: 1, first_seen: '2024-01-03T00:00:00Z' });
		const b = edge('asset:2', 'asset:1', { id: 2, first_seen: '2024-01-01T00:00:00Z' });
		const c = edge('asset:2', 'ioc:2', { id: 3, first_seen: '2024-01-03T00:00:00Z' });
		const undated = edge('asset:3', 'ioc:3', { id: 4 });

		it('orders dated edges by first_seen with a stable tie-break, drops undated', () => {
			expect(replayOrder([a, undated, c, b]).map((e) => e.key)).toEqual(['e:2', 'e:1', 'e:3']);
		});

		it('replayFrame() reveals edges and their endpoints step by step', () => {
			const order = replayOrder([a, b, c]);
			const f0 = replayFrame(order, 0);
			expect(f0.edges.size).toBe(0);
			expect(f0.current).toBeNull();
			expect(f0.at).toBeNull();

			const f1 = replayFrame(order, 1);
			expect([...f1.edges]).toEqual(['e:2']);
			expect([...f1.nodes].sort()).toEqual(['asset:1', 'asset:2']);
			expect(f1.at).toBe(T('2024-01-01T00:00:00Z'));

			const f2 = replayFrame(order, 2);
			expect(f2.nodes.has('ioc:1')).toBe(true);
			expect(f2.nodes.has('ioc:2')).toBe(false);

			expect(replayFrame(order, 99).edges.size).toBe(3);
			expect(replayFrame(order, -3).edges.size).toBe(0);
		});

		it('stepAt() seeks to the edges started at a time', () => {
			const order = replayOrder([a, b, c]);
			expect(stepAt(order, T('2023-12-31T00:00:00Z'))).toBe(0);
			expect(stepAt(order, T('2024-01-02T00:00:00Z'))).toBe(1);
			expect(stepAt(order, T('2024-01-03T00:00:00Z'))).toBe(3);
		});

		it('replayDelay() scales with the speed', () => {
			expect(replayDelay(1)).toBe(900);
			expect(replayDelay(2)).toBe(450);
			expect(replayDelay(0)).toBe(900);
			expect(replayDelay(1000)).toBe(50);
		});
	});

	it('histogram() buckets first_seen', () => {
		const bounds = { min: T('2024-01-01T00:00:00Z'), max: T('2024-01-05T00:00:00Z') };
		const h = histogram(
			[
				edge('a:1', 'b:1', { first_seen: '2024-01-01T00:00:00Z' }),
				edge('a:1', 'b:2', { first_seen: '2024-01-05T00:00:00Z' }),
				edge('a:1', 'b:3', { first_seen: '2024-01-04T23:00:00Z' }),
				edge('a:1', 'b:4')
			],
			bounds,
			4
		);
		expect(h).toEqual([1, 0, 0, 2]);
		expect(
			histogram([edge('a:1', 'b:1', { first_seen: '2024-01-01T00:00:00Z' })], { min: 5, max: 5 }, 3)
		).toEqual([1, 0, 0]);
	});
});

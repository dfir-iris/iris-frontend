import { describe, expect, it } from 'vitest';
import {
	midpoint,
	orthogonalRoute,
	roundedPath,
	routeEdge,
	simplify,
	type Box,
	type EdgeEnds,
	type Point
} from '../edge-routing';

const box = (id: string, x: number, y: number, width = 220, height = 60): Box => ({
	id,
	x,
	y,
	width,
	height
});

function crossesBox(points: Point[], b: Box): boolean {
	// Dense sampling of the polyline against the open box
	for (let i = 1; i < points.length; i++) {
		for (let k = 0; k <= 50; k++) {
			const x = points[i - 1].x + ((points[i].x - points[i - 1].x) * k) / 50;
			const y = points[i - 1].y + ((points[i].y - points[i - 1].y) * k) / 50;
			if (x > b.x && x < b.x + b.width && y > b.y && y < b.y + b.height) return true;
		}
	}
	return false;
}

const isOrthogonal = (points: Point[]) =>
	points.slice(1).every((p, i) => p.x === points[i].x || p.y === points[i].y);

describe('routeEdge', () => {
	it('should keep the bezier when no node is in the way', () => {
		const a = box('a', 0, 0);
		const b = box('b', 0, 200);
		const ends: EdgeEnds = {
			source: { x: 110, y: 60 },
			sourceSide: 'bottom',
			target: { x: 110, y: 200 },
			targetSide: 'top',
			sourceId: 'a',
			targetId: 'b'
		};
		const result = routeEdge(ends, [a, b]);
		expect(result.routed).toBe(false);
		expect(result.path.startsWith('M110,60 C')).toBe(true);
	});

	it('should go around a node lying between the two ends', () => {
		const a = box('a', 0, 0);
		const middle = box('m', 0, 150);
		const b = box('b', 0, 300);
		const ends: EdgeEnds = {
			source: { x: 110, y: 60 },
			sourceSide: 'bottom',
			target: { x: 110, y: 300 },
			targetSide: 'top',
			sourceId: 'a',
			targetId: 'b'
		};
		const result = routeEdge(ends, [a, middle, b]);
		expect(result.routed).toBe(true);
		const points = orthogonalRoute(ends, [a, middle, b])!;
		expect(points[0]).toEqual(ends.source);
		expect(points[points.length - 1]).toEqual(ends.target);
		expect(isOrthogonal(points)).toBe(true);
		expect(crossesBox(points, middle)).toBe(false);
	});

	it('should route a link back up around its own nodes', () => {
		const a = box('a', 0, 300);
		const b = box('b', 0, 0);
		const ends: EdgeEnds = {
			source: { x: 110, y: 360 },
			sourceSide: 'bottom',
			target: { x: 110, y: 0 },
			targetSide: 'top',
			sourceId: 'a',
			targetId: 'b'
		};
		const points = orthogonalRoute(ends, [a, b])!;
		expect(points).not.toBeNull();
		expect(isOrthogonal(points)).toBe(true);
		// Leaves downwards, enters from above, never through either node
		expect(points[1].y).toBeGreaterThan(360);
		expect(points[points.length - 2].y).toBeLessThan(0);
		expect(crossesBox(points.slice(1, -1), a)).toBe(false);
		expect(crossesBox(points.slice(1, -1), b)).toBe(false);
	});

	it('should consider a far node the route would cross', () => {
		const a = box('a', 0, 0);
		const b = box('b', 0, 1200);
		const wall = box('w', -400, 600, 1100, 60);
		const ends: EdgeEnds = {
			source: { x: 110, y: 60 },
			sourceSide: 'bottom',
			target: { x: 110, y: 1200 },
			targetSide: 'top',
			sourceId: 'a',
			targetId: 'b'
		};
		const points = orthogonalRoute(ends, [a, wall, b])!;
		expect(crossesBox(points, wall)).toBe(false);
	});
});

describe('path helpers', () => {
	it('should drop duplicate and collinear points', () => {
		expect(
			simplify([
				{ x: 0, y: 0 },
				{ x: 0, y: 0 },
				{ x: 0, y: 10 },
				{ x: 0, y: 20 },
				{ x: 10, y: 20 }
			])
		).toEqual([
			{ x: 0, y: 0 },
			{ x: 0, y: 20 },
			{ x: 10, y: 20 }
		]);
	});

	it('should round the corners and find the middle', () => {
		const points = [
			{ x: 0, y: 0 },
			{ x: 0, y: 100 },
			{ x: 100, y: 100 }
		];
		expect(roundedPath(points)).toBe('M0,0 L0,92 Q0,100 8,100 L100,100');
		expect(midpoint(points)).toEqual({ x: 0, y: 100 });
	});
});

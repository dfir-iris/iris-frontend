/**
 * Edges that go around the nodes of a flow canvas.
 *
 * An edge keeps xyflow's bezier curve while that curve crosses no node.
 * When it would, it is routed orthogonally around them: from a short
 * stub out of the source handle to a stub in front of the target handle,
 * over a sparse grid made of the node box edges (inflated by a margin),
 * with an A* search that charges each bend so the route stays simple.
 * Corners are rounded. Only the nodes near the edge are considered first;
 * a node the route then crosses is added and the route searched again.
 */

export type Side = 'left' | 'top' | 'right' | 'bottom';

export interface Point {
	x: number;
	y: number;
}

export interface Box {
	id: string;
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface EdgeEnds {
	source: Point;
	sourceSide: Side;
	target: Point;
	targetSide: Side;
	sourceId?: string;
	targetId?: string;
}

export interface RoutedPath {
	path: string;
	labelX: number;
	labelY: number;
	/** False when the plain bezier was kept. */
	routed: boolean;
}

/** Distance kept between a route and the nodes. */
const MARGIN = 20;
/** Cost of a bend, in pixels of length. */
const BEND_COST = 40;
const CORNER_RADIUS = 8;
const CURVATURE = 0.25;
/** How far around the edge's own extent nodes are considered first. */
const NEAR = 240;
const BEZIER_SAMPLES = 32;

const DIRECTION: Record<Side, Point> = {
	left: { x: -1, y: 0 },
	right: { x: 1, y: 0 },
	top: { x: 0, y: -1 },
	bottom: { x: 0, y: 1 }
};

// ---- Bezier (as xyflow draws it) --------------------------------------------

function controlOffset(distance: number): number {
	return distance >= 0 ? 0.5 * distance : CURVATURE * 25 * Math.sqrt(-distance);
}

function control(side: Side, from: Point, to: Point): Point {
	switch (side) {
		case 'left':
			return { x: from.x - controlOffset(from.x - to.x), y: from.y };
		case 'right':
			return { x: from.x + controlOffset(to.x - from.x), y: from.y };
		case 'top':
			return { x: from.x, y: from.y - controlOffset(from.y - to.y) };
		default:
			return { x: from.x, y: from.y + controlOffset(to.y - from.y) };
	}
}

/** xyflow's bezier between the two handles: its path, label point and samples. */
export function bezier(ends: EdgeEnds): { path: string; label: Point; samples: Point[] } {
	const { source: s, target: t } = ends;
	const c1 = control(ends.sourceSide, s, t);
	const c2 = control(ends.targetSide, t, s);
	const at = (u: number): Point => {
		const v = 1 - u;
		return {
			x: v * v * v * s.x + 3 * v * v * u * c1.x + 3 * v * u * u * c2.x + u * u * u * t.x,
			y: v * v * v * s.y + 3 * v * v * u * c1.y + 3 * v * u * u * c2.y + u * u * u * t.y
		};
	};
	const samples = Array.from({ length: BEZIER_SAMPLES + 1 }, (_, i) => at(i / BEZIER_SAMPLES));
	return {
		path: `M${s.x},${s.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${t.x},${t.y}`,
		label: at(0.5),
		samples
	};
}

// ---- Geometry ---------------------------------------------------------------

interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

function rectOf(box: Box, pad: number): Rect {
	return {
		left: box.x - pad,
		top: box.y - pad,
		right: box.x + box.width + pad,
		bottom: box.y + box.height + pad
	};
}

/** Whether segment a-b goes through the inside of `r` (its border does not count). */
function crosses(a: Point, b: Point, r: Rect): boolean {
	// Liang–Barsky clipping against the open rectangle
	let t0 = 0;
	let t1 = 1;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const edges: Array<[number, number]> = [
		[-dx, a.x - r.left],
		[dx, r.right - a.x],
		[-dy, a.y - r.top],
		[dy, r.bottom - a.y]
	];
	for (const [p, q] of edges) {
		if (p === 0) {
			if (q <= 0) return false;
			continue;
		}
		const t = q / p;
		if (p < 0) {
			if (t > t1) return false;
			if (t > t0) t0 = t;
		} else {
			if (t < t0) return false;
			if (t < t1) t1 = t;
		}
	}
	if (t1 - t0 <= 1e-9) return false;
	// The clipped part must lie strictly inside, not along the border
	const m = { x: a.x + dx * ((t0 + t1) / 2), y: a.y + dy * ((t0 + t1) / 2) };
	return m.x > r.left && m.x < r.right && m.y > r.top && m.y < r.bottom;
}

function inside(p: Point, r: Rect): boolean {
	return p.x > r.left && p.x < r.right && p.y > r.top && p.y < r.bottom;
}

function polylineCrosses(points: Point[], rects: Rect[]): boolean {
	for (let i = 1; i < points.length; i++) {
		for (const r of rects) if (crosses(points[i - 1], points[i], r)) return true;
	}
	return false;
}

/**
 * Obstacles for the bezier test: the other nodes slightly inflated, the
 * edge's own nodes slightly shrunk (the curve starts on their border).
 */
function bezierObstacles(ends: EdgeEnds, boxes: Box[]): Rect[] {
	return boxes.map((b) => rectOf(b, b.id === ends.sourceId || b.id === ends.targetId ? -2 : 4));
}

// ---- Orthogonal route -------------------------------------------------------

function uniqueSorted(values: number[]): number[] {
	const sorted = [...values].sort((a, b) => a - b);
	return sorted.filter((v, i) => i === 0 || v - sorted[i - 1] > 0.5);
}

type Dir = 0 | 1 | 2 | 3; // right, down, left, up
const STEPS: Array<{ dx: number; dy: number }> = [
	{ dx: 1, dy: 0 },
	{ dx: 0, dy: 1 },
	{ dx: -1, dy: 0 },
	{ dx: 0, dy: -1 }
];

function dirOf(v: Point): Dir {
	if (v.x > 0) return 0;
	if (v.y > 0) return 1;
	if (v.x < 0) return 2;
	return 3;
}

/** A* over the grid of `rects` edges from `start` to `end`; null when boxed in. */
function search(
	start: Point,
	startDir: Dir,
	end: Point,
	endDir: Dir,
	rects: Rect[]
): Point[] | null {
	const xs = uniqueSorted([
		start.x,
		end.x,
		(start.x + end.x) / 2,
		...rects.flatMap((r) => [r.left, r.right])
	]);
	const ys = uniqueSorted([
		start.y,
		end.y,
		(start.y + end.y) / 2,
		...rects.flatMap((r) => [r.top, r.bottom])
	]);
	const index = (values: number[], v: number) => {
		let best = 0;
		for (let i = 1; i < values.length; i++) {
			if (Math.abs(values[i] - v) < Math.abs(values[best] - v)) best = i;
		}
		return best;
	};
	const W = xs.length;
	const H = ys.length;
	const blocked = new Uint8Array(W * H);
	for (let j = 0; j < H; j++) {
		for (let i = 0; i < W; i++) {
			const p = { x: xs[i], y: ys[j] };
			if (rects.some((r) => inside(p, r))) blocked[j * W + i] = 1;
		}
	}
	const si = index(xs, start.x);
	const sj = index(ys, start.y);
	const ei = index(xs, end.x);
	const ej = index(ys, end.y);
	blocked[sj * W + si] = 0;
	blocked[ej * W + ei] = 0;

	// State: cell × direction of arrival
	const key = (cell: number, d: number) => cell * 4 + d;
	const cost = new Float64Array(W * H * 4).fill(Infinity);
	const from = new Int32Array(W * H * 4).fill(-1);
	const heuristic = (cell: number) =>
		Math.abs(xs[cell % W] - end.x) + Math.abs(ys[Math.floor(cell / W)] - end.y);
	// Small binary heap of [priority, state]
	const heap: Array<[number, number]> = [];
	const push = (item: [number, number]) => {
		heap.push(item);
		let i = heap.length - 1;
		while (i > 0) {
			const parent = (i - 1) >> 1;
			if (heap[parent][0] <= heap[i][0]) break;
			[heap[parent], heap[i]] = [heap[i], heap[parent]];
			i = parent;
		}
	};
	const pop = (): [number, number] => {
		const top = heap[0];
		const last = heap.pop()!;
		if (heap.length) {
			heap[0] = last;
			let i = 0;
			for (;;) {
				const l = 2 * i + 1;
				const r = l + 1;
				let m = i;
				if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
				if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
				if (m === i) break;
				[heap[m], heap[i]] = [heap[i], heap[m]];
				i = m;
			}
		}
		return top;
	};

	const startCell = sj * W + si;
	const endCell = ej * W + ei;
	cost[key(startCell, startDir)] = 0;
	push([heuristic(startCell), key(startCell, startDir)]);
	let found = -1;
	while (heap.length) {
		const [priority, state] = pop();
		const cell = state >> 2;
		const d = state & 3;
		const g = cost[state];
		if (priority - heuristic(cell) > g + 1e-6) continue;
		if (cell === endCell) {
			found = state;
			break;
		}
		const i = cell % W;
		const j = Math.floor(cell / W);
		for (let nd = 0; nd < 4; nd++) {
			if (nd === ((d + 2) & 3)) continue; // no U-turn in place
			const ni = i + STEPS[nd].dx;
			const nj = j + STEPS[nd].dy;
			if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
			const next = nj * W + ni;
			if (blocked[next]) continue;
			const a = { x: xs[i], y: ys[j] };
			const b = { x: xs[ni], y: ys[nj] };
			if (rects.some((r) => crosses(a, b, r))) continue;
			let step = Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + (nd !== d ? BEND_COST : 0);
			if (next === endCell && nd !== endDir) step += BEND_COST;
			const ns = key(next, nd);
			if (g + step < cost[ns] - 1e-6) {
				cost[ns] = g + step;
				from[ns] = state;
				push([g + step + heuristic(next), ns]);
			}
		}
	}
	if (found < 0) return null;
	const points: Point[] = [];
	for (let s = found; s >= 0; s = from[s]) {
		const cell = s >> 2;
		points.push({ x: xs[cell % W], y: ys[Math.floor(cell / W)] });
	}
	return points.reverse();
}

/** Drops repeated and collinear points. */
export function simplify(points: Point[]): Point[] {
	const out: Point[] = [];
	for (const p of points) {
		const last = out[out.length - 1];
		if (last && Math.abs(last.x - p.x) < 0.5 && Math.abs(last.y - p.y) < 0.5) continue;
		if (out.length >= 2) {
			const a = out[out.length - 2];
			const b = out[out.length - 1];
			const collinear =
				(Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - p.x) < 0.5) ||
				(Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - p.y) < 0.5);
			if (collinear) {
				out[out.length - 1] = p;
				continue;
			}
		}
		out.push(p);
	}
	return out;
}

/** SVG path through `points` with rounded corners. */
export function roundedPath(points: Point[], radius = CORNER_RADIUS): string {
	if (points.length === 0) return '';
	let d = `M${points[0].x},${points[0].y}`;
	for (let i = 1; i < points.length - 1; i++) {
		const [a, b, c] = [points[i - 1], points[i], points[i + 1]];
		const r = Math.min(
			radius,
			Math.hypot(b.x - a.x, b.y - a.y) / 2,
			Math.hypot(c.x - b.x, c.y - b.y) / 2
		);
		const toward = (p: Point, q: Point) => {
			const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
			return { x: p.x + ((q.x - p.x) / len) * r, y: p.y + ((q.y - p.y) / len) * r };
		};
		const before = toward(b, a);
		const after = toward(b, c);
		d += ` L${before.x},${before.y} Q${b.x},${b.y} ${after.x},${after.y}`;
	}
	const last = points[points.length - 1];
	return `${d} L${last.x},${last.y}`;
}

/** The point halfway along `points`. */
export function midpoint(points: Point[]): Point {
	const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
	let half = lengths.reduce((a, b) => a + b, 0) / 2;
	for (let i = 0; i < lengths.length; i++) {
		if (half <= lengths[i] && lengths[i] > 0) {
			const u = half / lengths[i];
			return {
				x: points[i].x + (points[i + 1].x - points[i].x) * u,
				y: points[i].y + (points[i + 1].y - points[i].y) * u
			};
		}
		half -= lengths[i];
	}
	return points[0];
}

/** The orthogonal route between the handles, around `boxes`; null when none is found. */
export function orthogonalRoute(ends: EdgeEnds, boxes: Box[]): Point[] | null {
	const out = DIRECTION[ends.sourceSide];
	const into = DIRECTION[ends.targetSide];
	const start = { x: ends.source.x + out.x * MARGIN, y: ends.source.y + out.y * MARGIN };
	const end = { x: ends.target.x + into.x * MARGIN, y: ends.target.y + into.y * MARGIN };
	// Just inside the stubs, so they stay outside every inflated box
	const all = boxes.map((b) => ({ id: b.id, rect: rectOf(b, MARGIN - 1) }));
	const region: Rect = {
		left: Math.min(start.x, end.x) - NEAR,
		top: Math.min(start.y, end.y) - NEAR,
		right: Math.max(start.x, end.x) + NEAR,
		bottom: Math.max(start.y, end.y) + NEAR
	};
	const overlaps = (r: Rect) =>
		r.left < region.right &&
		r.right > region.left &&
		r.top < region.bottom &&
		r.bottom > region.top;
	const used = new Set(all.filter((o) => overlaps(o.rect)).map((o) => o.id));
	for (let attempt = 0; attempt < 4; attempt++) {
		const rects = all.filter((o) => used.has(o.id)).map((o) => o.rect);
		const route = search(start, dirOf(out), end, dirOf({ x: -into.x, y: -into.y }), rects);
		if (!route) return null;
		const points = simplify([ends.source, ...route, ends.target]);
		const missed = all.filter(
			(o) => !used.has(o.id) && polylineCrosses(points.slice(1, -1), [o.rect])
		);
		if (missed.length === 0) return points;
		for (const o of missed) used.add(o.id);
	}
	return null;
}

/**
 * The path of an edge: xyflow's bezier when it crosses no node, else a
 * rounded orthogonal route around them (the bezier when none is found).
 */
export function routeEdge(ends: EdgeEnds, boxes: Box[]): RoutedPath {
	const curve = bezier(ends);
	const plain = { path: curve.path, labelX: curve.label.x, labelY: curve.label.y, routed: false };
	if (!polylineCrosses(curve.samples, bezierObstacles(ends, boxes))) return plain;
	const points = orthogonalRoute(ends, boxes);
	if (!points) return plain;
	const label = midpoint(points);
	return { path: roundedPath(points), labelX: label.x, labelY: label.y, routed: true };
}

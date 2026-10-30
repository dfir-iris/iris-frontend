import type { Core, LayoutOptions, NodeCollection, Position } from 'cytoscape';

export type Positions = Record<string, Position>;

export type CyLayoutName =
	| 'fcose'
	| 'dagre'
	| 'chronological'
	| 'radial'
	| 'grouped'
	| 'grid'
	| 'preset';

// ---------------------------------------------------------------------------
// Pure position computations (unit-tested, no cytoscape involved)
// ---------------------------------------------------------------------------

export interface ChronoItem {
	id: string;
	/** Epoch ms, or null when the node has no date. */
	time: number | null;
}

export interface ChronoOptions {
	/** Width of the dated band. */
	width?: number;
	/** Vertical spacing between nodes stacked in the same column. */
	rowGap?: number;
	/** Minimum horizontal distance between two columns. */
	minColumnGap?: number;
	/** Horizontal gap between the undated column and the dated band. */
	undatedGap?: number;
}

/**
 * Chronological layout: x is proportional to the date (`first_seen`), nodes
 * whose x would collide are stacked into the same column, centred on y = 0.
 * Undated nodes go in a column left of the band.
 */
export const chronologicalPositions = (
	items: ChronoItem[],
	{ width = 1600, rowGap = 80, minColumnGap = 90, undatedGap = 160 }: ChronoOptions = {}
): Positions => {
	const out: Positions = {};
	const dated = items
		.filter((i): i is ChronoItem & { time: number } => i.time !== null && Number.isFinite(i.time))
		.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
	const undated = items
		.filter((i) => i.time === null || !Number.isFinite(i.time))
		.sort((a, b) => a.id.localeCompare(b.id));

	const stack = (ids: string[], x: number) => {
		const offset = ((ids.length - 1) * rowGap) / 2;
		ids.forEach((id, i) => (out[id] = { x, y: i * rowGap - offset }));
	};

	if (dated.length) {
		const t0 = dated[0].time;
		const span = dated[dated.length - 1].time - t0;
		const columns: { x: number; ids: string[] }[] = [];
		for (const item of dated) {
			const x = span > 0 ? ((item.time - t0) / span) * width : 0;
			const last = columns[columns.length - 1];
			if (last && x - last.x < minColumnGap) last.ids.push(item.id);
			else columns.push({ x: last ? Math.max(x, last.x + minColumnGap) : x, ids: [item.id] });
		}
		for (const c of columns) stack(c.ids, c.x);
	}
	if (undated.length)
		stack(
			undated.map((u) => u.id),
			-undatedGap
		);
	return out;
};

export interface RadialOptions {
	radiusStep?: number;
	/** Minimum arc length between two nodes on the same ring. */
	minArc?: number;
	center?: Position;
}

/**
 * Radial layout around `centerId`: rings by hop distance (BFS over the
 * undirected adjacency), unreachable nodes on an outer ring. A ring grows
 * when it would be too crowded.
 */
export const radialPositions = (
	centerId: string,
	nodeIds: string[],
	adjacency: Map<string, Iterable<string>>,
	{ radiusStep = 160, minArc = 70, center = { x: 0, y: 0 } }: RadialOptions = {}
): Positions => {
	const hops = new Map<string, number>([[centerId, 0]]);
	const queue = [centerId];
	while (queue.length) {
		const cur = queue.shift() as string;
		for (const n of adjacency.get(cur) ?? []) {
			if (!hops.has(n)) {
				hops.set(n, (hops.get(cur) ?? 0) + 1);
				queue.push(n);
			}
		}
	}
	const maxHop = Math.max(0, ...[...hops.values()]);
	const rings = new Map<number, string[]>();
	for (const id of [...nodeIds].sort()) {
		if (id === centerId) continue;
		const h = hops.get(id) ?? maxHop + 1;
		rings.set(h, [...(rings.get(h) ?? []), id]);
	}
	const out: Positions = { [centerId]: { ...center } };
	let radius = 0;
	for (const h of [...rings.keys()].sort((a, b) => a - b)) {
		const ids = rings.get(h) as string[];
		radius = Math.max(radius + radiusStep, (ids.length * minArc) / (2 * Math.PI));
		ids.forEach((id, i) => {
			const angle = (2 * Math.PI * i) / ids.length - Math.PI / 2;
			out[id] = { x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
		});
	}
	return out;
};

export interface GroupedItem {
	id: string;
	group: string;
}

export interface GroupedOptions {
	cell?: number;
	groupGap?: number;
	/** Target width of a row of groups before wrapping. */
	maxRowWidth?: number;
}

export interface GroupedLayout {
	positions: Positions;
	/** Top-left corner and size of each group block, for labels. */
	groups: { group: string; x: number; y: number; width: number; height: number; count: number }[];
}

/**
 * Grouped grid: each group is a square-ish grid block, blocks flow left to
 * right and wrap at `maxRowWidth`. Groups are ordered by size (largest
 * first), then name.
 */
export const groupedGridPositions = (
	items: GroupedItem[],
	{ cell = 110, groupGap = 140, maxRowWidth = 2400 }: GroupedOptions = {}
): GroupedLayout => {
	const byGroup = new Map<string, string[]>();
	for (const it of items) byGroup.set(it.group, [...(byGroup.get(it.group) ?? []), it.id]);
	const groups = [...byGroup.entries()].sort(
		(a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
	);

	const positions: Positions = {};
	const blocks: GroupedLayout['groups'] = [];
	let x = 0;
	let y = 0;
	let rowHeight = 0;
	for (const [group, ids] of groups) {
		const cols = Math.ceil(Math.sqrt(ids.length));
		const rows = Math.ceil(ids.length / cols);
		const w = cols * cell;
		const h = rows * cell;
		if (x > 0 && x + w > maxRowWidth) {
			x = 0;
			y += rowHeight + groupGap;
			rowHeight = 0;
		}
		[...ids].sort().forEach((id, i) => {
			positions[id] = {
				x: x + (i % cols) * cell + cell / 2,
				y: y + Math.floor(i / cols) * cell + cell / 2
			};
		});
		blocks.push({ group, x, y, width: w, height: h, count: ids.length });
		x += w + groupGap;
		rowHeight = Math.max(rowHeight, h);
	}
	return { positions, groups: blocks };
};

/** Plain grid, row-major, `cols` defaults to ~sqrt(n). */
export const gridPositions = (ids: string[], cell = 110, cols?: number): Positions => {
	const c = cols ?? Math.max(1, Math.ceil(Math.sqrt(ids.length)));
	const out: Positions = {};
	ids.forEach((id, i) => (out[id] = { x: (i % c) * cell, y: Math.floor(i / c) * cell }));
	return out;
};

/** Nodes within `hops` of `start` (inclusive) over an undirected adjacency. */
export const withinHops = (
	start: string,
	adjacency: Map<string, Iterable<string>>,
	hops: number
): Set<string> => {
	const seen = new Set([start]);
	let frontier = [start];
	for (let h = 0; h < hops && frontier.length; h++) {
		const next: string[] = [];
		for (const cur of frontier) {
			for (const n of adjacency.get(cur) ?? []) {
				if (!seen.has(n)) {
					seen.add(n);
					next.push(n);
				}
			}
		}
		frontier = next;
	}
	return seen;
};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export interface RunLayoutOptions {
	/** Nodes to lay out; defaults to every visible node. */
	nodes?: NodeCollection;
	/** Pinned node ids keep their current position. */
	pinned?: Set<string>;
	animate?: boolean;
	fit?: boolean;
	padding?: number;
	/** `radial`: node at the centre. */
	centerId?: string;
	/** `chronological`: epoch ms of a node, null when undated. */
	timeOf?: (id: string) => number | null;
	/** `grouped`: group label of a node. */
	groupOf?: (id: string) => string;
	/** `preset`: positions to apply. */
	positions?: Positions;
	/** `fcose`: start from current positions instead of randomising. */
	incremental?: boolean;
}

const adjacencyOf = (cy: Core, nodes: NodeCollection): Map<string, Set<string>> => {
	const ids = new Set(nodes.map((n) => n.id()));
	const adj = new Map<string, Set<string>>();
	for (const id of ids) adj.set(id, new Set());
	cy.edges(':visible').forEach((e) => {
		const s = e.source().id();
		const t = e.target().id();
		if (ids.has(s) && ids.has(t) && s !== t) {
			adj.get(s)?.add(t);
			adj.get(t)?.add(s);
		}
	});
	return adj;
};

const centreOf = (nodes: NodeCollection): Position => {
	if (nodes.empty()) return { x: 0, y: 0 };
	const bb = nodes.boundingBox({});
	return { x: (bb.x1 + bb.x2) / 2, y: (bb.y1 + bb.y2) / 2 };
};

/** Shift a set of computed positions so its centre lands on `centre`. */
const recentre = (positions: Positions, centre: Position): Positions => {
	const pts = Object.values(positions);
	if (!pts.length) return positions;
	const xs = pts.map((p) => p.x);
	const ys = pts.map((p) => p.y);
	const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
	const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
	const out: Positions = {};
	for (const [id, p] of Object.entries(positions)) {
		out[id] = { x: p.x - cx + centre.x, y: p.y - cy + centre.y };
	}
	return out;
};

/**
 * Run a named layout on the instance. Pinned nodes keep their position
 * (fcose gets them as fixed constraints, other layouts restore them after).
 * Resolves with the final positions of the laid-out nodes.
 */
export const runLayout = (
	cy: Core,
	name: CyLayoutName,
	opts: RunLayoutOptions = {}
): Promise<Positions> => {
	const {
		pinned = new Set<string>(),
		animate = true,
		fit = true,
		padding = 40,
		incremental = false
	} = opts;
	const nodes = opts.nodes ?? cy.nodes(':visible');
	const free = nodes.filter((n) => !pinned.has(n.id()));
	const pinnedPositions: Positions = {};
	nodes.forEach((n) => {
		if (pinned.has(n.id())) pinnedPositions[n.id()] = { ...n.position() };
	});
	const eles = nodes.union(nodes.edgesWith(nodes));
	const centre = centreOf(nodes);

	let options: LayoutOptions;
	const preset = (positions: Positions): LayoutOptions =>
		({
			name: 'preset',
			positions: (n: { id: () => string }) => positions[n.id()] ?? pinnedPositions[n.id()],
			animate,
			animationDuration: 350,
			fit,
			padding
		}) as unknown as LayoutOptions;

	switch (name) {
		case 'fcose':
			options = {
				name: 'fcose',
				quality: incremental ? 'proof' : 'default',
				randomize: !incremental,
				animate,
				animationDuration: 500,
				fit,
				padding,
				nodeDimensionsIncludeLabels: true,
				nodeSeparation: 90,
				idealEdgeLength: () => 110,
				nodeRepulsion: () => 9000,
				edgeElasticity: () => 0.4,
				gravity: 0.3,
				numIter: 2500,
				packComponents: false,
				fixedNodeConstraint: Object.entries(pinnedPositions).map(([nodeId, position]) => ({
					nodeId,
					position
				}))
			} as unknown as LayoutOptions;
			break;
		case 'dagre':
			options = {
				name: 'dagre',
				rankDir: 'TB',
				nodeSep: 50,
				rankSep: 90,
				edgeSep: 10,
				animate,
				animationDuration: 400,
				fit,
				padding
			} as unknown as LayoutOptions;
			break;
		case 'chronological': {
			const timeOf = opts.timeOf ?? (() => null);
			options = preset(
				recentre(
					chronologicalPositions(free.map((n) => ({ id: n.id(), time: timeOf(n.id()) }))),
					centre
				)
			);
			break;
		}
		case 'radial': {
			if (nodes.empty()) return Promise.resolve({});
			const centerId =
				opts.centerId && nodes.getElementById(opts.centerId).nonempty()
					? opts.centerId
					: nodes
							.sort((a, b) => b.degree(false) - a.degree(false))
							.first()
							.id();
			const c = cy.getElementById(centerId).position();
			options = preset(
				radialPositions(
					centerId,
					nodes.map((n) => n.id()),
					adjacencyOf(cy, nodes),
					{ center: { ...c } }
				)
			);
			break;
		}
		case 'grouped': {
			const groupOf = opts.groupOf ?? (() => 'All');
			options = preset(
				recentre(
					groupedGridPositions(free.map((n) => ({ id: n.id(), group: groupOf(n.id()) }))).positions,
					centre
				)
			);
			break;
		}
		case 'grid':
			options = preset(recentre(gridPositions(free.map((n) => n.id()).sort()), centre));
			break;
		case 'preset':
		default:
			options = preset(opts.positions ?? {});
			break;
	}

	return new Promise((resolve) => {
		const layout = eles.layout(options);
		layout.one('layoutstop', () => {
			cy.batch(() => {
				for (const [id, p] of Object.entries(pinnedPositions)) {
					cy.getElementById(id).position(p);
				}
			});
			const out: Positions = {};
			nodes.forEach((n) => {
				out[n.id()] = { ...n.position() };
			});
			resolve(out);
		});
		layout.run();
	});
};

import type { Core, Position } from 'cytoscape';
import type { CyElementDef } from './types';

/** What the component last pushed for an element, to diff the next render against. */
export interface CySnapshot {
	group: 'nodes' | 'edges';
	data: Record<string, unknown>;
	classes: string[];
}

export interface CyElementUpdate {
	id: string;
	/** Changed or added data keys (never includes `id`). */
	data?: Record<string, unknown>;
	/** Keys present before and absent now. */
	removedKeys?: string[];
	/** New full class list, when it changed. */
	classes?: string[];
	/** New endpoints, when an edge's source/target changed. */
	move?: { source: string; target: string };
}

export interface CyDiff {
	add: CyElementDef[];
	remove: string[];
	update: CyElementUpdate[];
}

/** Structural equality for JSON-ish values (data payloads). */
export const sameValue = (a: unknown, b: unknown): boolean => {
	if (a === b) return true;
	if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
		return Number.isNaN(a) && Number.isNaN(b);
	}
	if (Array.isArray(a) !== Array.isArray(b)) return false;
	if (Array.isArray(a) && Array.isArray(b)) {
		return a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
	}
	const ka = Object.keys(a as object);
	const kb = Object.keys(b as object);
	if (ka.length !== kb.length) return false;
	return ka.every((k) =>
		sameValue((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])
	);
};

const sameClasses = (a: string[], b: string[]) => {
	if (a.length !== b.length) return false;
	const sa = [...a].sort();
	const sb = [...b].sort();
	return sa.every((c, i) => c === sb[i]);
};

export const snapshotOf = (def: CyElementDef): CySnapshot => ({
	group: def.group,
	data: { ...def.data },
	classes: [...(def.classes ?? [])]
});

/**
 * Compare the previous snapshot (by id) with the next declarative element list.
 *
 * - ids that disappeared are removed,
 * - new ids are added (nodes before edges so endpoints exist),
 * - kept ids get a minimal data / classes / endpoints update — positions are
 *   never part of an update, so the layout survives every re-render.
 *
 * An id that changed group (node ↔ edge) is removed and re-added. Duplicate
 * ids in `next` keep the first occurrence.
 */
export const diffElements = (prev: Map<string, CySnapshot>, next: CyElementDef[]): CyDiff => {
	const seen = new Set<string>();
	const addNodes: CyElementDef[] = [];
	const addEdges: CyElementDef[] = [];
	const update: CyElementUpdate[] = [];
	const remove: string[] = [];

	for (const def of next) {
		const id = def.data.id;
		if (seen.has(id)) continue;
		seen.add(id);
		const before = prev.get(id);
		if (!before || before.group !== def.group) {
			if (before) remove.push(id);
			(def.group === 'nodes' ? addNodes : addEdges).push(def);
			continue;
		}

		const changed: CyElementUpdate = { id };
		let dirty = false;

		const data: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(def.data)) {
			if (k === 'id' || k === 'source' || k === 'target') continue;
			if (!sameValue(before.data[k], v)) data[k] = v;
		}
		if (Object.keys(data).length) {
			changed.data = data;
			dirty = true;
		}

		const removedKeys = Object.keys(before.data).filter(
			(k) => k !== 'id' && k !== 'source' && k !== 'target' && !(k in def.data)
		);
		if (removedKeys.length) {
			changed.removedKeys = removedKeys;
			dirty = true;
		}

		const classes = def.classes ?? [];
		if (!sameClasses(before.classes, classes)) {
			changed.classes = [...classes];
			dirty = true;
		}

		if (def.group === 'edges') {
			const { source, target } = def.data;
			if (before.data.source !== source || before.data.target !== target) {
				changed.move = { source, target };
				dirty = true;
			}
		}

		if (dirty) update.push(changed);
	}

	for (const id of prev.keys()) {
		if (!seen.has(id)) remove.push(id);
	}

	return { add: [...addNodes, ...addEdges], remove, update };
};

/**
 * Where to drop a node that arrives without a position: at the centroid of
 * its already-placed neighbours (plus a small deterministic offset so
 * siblings don't stack), else at `fallback`.
 */
export const placeNear = (
	neighbours: Position[],
	fallback: Position,
	index: number,
	spread = 60
): Position => {
	const angle = index * 2.399963; // golden angle
	const radius = spread * (1 + Math.floor(index / 8) * 0.5);
	if (!neighbours.length) {
		return {
			x: fallback.x + Math.cos(angle) * radius * (index ? 1 : 0),
			y: fallback.y + Math.sin(angle) * radius * (index ? 1 : 0)
		};
	}
	const cx = neighbours.reduce((s, p) => s + p.x, 0) / neighbours.length;
	const cy = neighbours.reduce((s, p) => s + p.y, 0) / neighbours.length;
	return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
};

/**
 * Apply a diff to a live instance in one batch. New nodes without a position
 * are placed near their neighbours (from the edges being added) or at the
 * viewport centre. Returns the ids of nodes that were auto-placed.
 */
export const applyDiff = (cy: Core, diff: CyDiff, preserveClasses: string[] = []): string[] => {
	const autoPlaced: string[] = [];
	cy.batch(() => {
		if (diff.remove.length) {
			const sel = cy.collection();
			for (const id of diff.remove) sel.merge(cy.getElementById(id));
			sel.remove();
		}

		for (const u of diff.update) {
			const ele = cy.getElementById(u.id);
			if (ele.empty()) continue;
			if (u.move && ele.isEdge()) {
				ele.move({ source: u.move.source, target: u.move.target });
			}
			if (u.removedKeys?.length) ele.removeData(u.removedKeys.join(' '));
			if (u.data) ele.data(u.data);
			if (u.classes) {
				const kept = preserveClasses.filter((c) => ele.hasClass(c) && !u.classes?.includes(c));
				ele.classes([...u.classes, ...kept]);
			}
		}

		if (!diff.add.length) return;

		const ext = cy.extent();
		const centre = { x: (ext.x1 + ext.x2) / 2, y: (ext.y1 + ext.y2) / 2 };
		const pendingEdges = diff.add.filter((d) => d.group === 'edges');
		const neighboursOf = (id: string): string[] =>
			pendingEdges
				.map((e) =>
					e.data.source === id ? e.data.target : e.data.target === id ? e.data.source : null
				)
				.filter((x): x is string => typeof x === 'string');

		let i = 0;
		const nodeDefs = diff.add.filter((d) => d.group === 'nodes');
		for (const def of nodeDefs) {
			let position = def.group === 'nodes' ? def.position : undefined;
			if (!position) {
				const placed = neighboursOf(def.data.id)
					.map((n) => cy.getElementById(n))
					.filter((n) => n.nonempty() && n.isNode())
					.map((n) => ({ ...n.position() }));
				position = placeNear(placed, centre, i++);
				autoPlaced.push(def.data.id);
			}
			cy.add({
				group: 'nodes',
				data: { ...def.data },
				classes: def.classes ?? [],
				position,
				selectable: def.selectable,
				grabbable: def.group === 'nodes' ? def.grabbable : undefined
			});
		}
		for (const def of pendingEdges) {
			if (
				cy.getElementById(def.data.source).empty() ||
				cy.getElementById(def.data.target).empty()
			) {
				continue;
			}
			cy.add({
				group: 'edges',
				data: { ...def.data },
				classes: def.classes ?? [],
				selectable: def.selectable
			});
		}
	});
	return autoPlaced;
};

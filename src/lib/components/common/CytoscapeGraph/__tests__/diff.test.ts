import { describe, expect, it } from 'vitest';
import cytoscape from 'cytoscape';
import {
	applyDiff,
	diffElements,
	placeNear,
	sameValue,
	snapshotOf,
	type CySnapshot
} from '../diff';
import type { CyElementDef } from '../types';

const node = (id: string, data: Record<string, unknown> = {}, classes: string[] = []) =>
	({ group: 'nodes', data: { id, ...data }, classes }) as CyElementDef;
const edge = (id: string, source: string, target: string, data: Record<string, unknown> = {}) =>
	({ group: 'edges', data: { id, source, target, ...data } }) as CyElementDef;

const snap = (defs: CyElementDef[]) =>
	new Map<string, CySnapshot>(defs.map((d) => [d.data.id, snapshotOf(d)]));

describe('sameValue', () => {
	it('compares nested JSON values structurally', () => {
		expect(sameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
		expect(sameValue({ a: [1, { b: 2 }] }, { a: [1, { b: 3 }] })).toBe(false);
		expect(sameValue([1], { 0: 1 })).toBe(false);
		expect(sameValue(Number.NaN, Number.NaN)).toBe(true);
		expect(sameValue(null, undefined)).toBe(false);
	});
});

describe('diffElements', () => {
	it('adds everything on first render, nodes before edges', () => {
		const d = diffElements(new Map(), [edge('e1', 'a', 'b'), node('a'), node('b')]);
		expect(d.add.map((x) => x.data.id)).toEqual(['a', 'b', 'e1']);
		expect(d.remove).toEqual([]);
		expect(d.update).toEqual([]);
	});

	it('is empty when nothing changed', () => {
		const defs = [node('a', { label: 'A' }, ['x']), node('b'), edge('e', 'a', 'b')];
		const d = diffElements(
			snap(defs),
			defs.map((x) => structuredClone(x))
		);
		expect(d).toEqual({ add: [], remove: [], update: [] });
	});

	it('removes vanished ids', () => {
		const prev = snap([node('a'), node('b'), edge('e', 'a', 'b')]);
		const d = diffElements(prev, [node('a')]);
		expect(d.remove.sort()).toEqual(['b', 'e']);
	});

	it('reports changed and removed data keys and class changes', () => {
		const prev = snap([node('a', { label: 'A', color: 'red' }, ['x'])]);
		const d = diffElements(prev, [node('a', { label: 'B' }, ['y'])]);
		expect(d.update).toEqual([
			{ id: 'a', data: { label: 'B' }, removedKeys: ['color'], classes: ['y'] }
		]);
	});

	it('ignores class order', () => {
		const prev = snap([node('a', {}, ['x', 'y'])]);
		expect(diffElements(prev, [node('a', {}, ['y', 'x'])]).update).toEqual([]);
	});

	it('moves edges whose endpoints changed', () => {
		const prev = snap([node('a'), node('b'), node('c'), edge('e', 'a', 'b')]);
		const d = diffElements(prev, [node('a'), node('b'), node('c'), edge('e', 'a', 'c')]);
		expect(d.update).toEqual([{ id: 'e', move: { source: 'a', target: 'c' } }]);
	});

	it('re-adds an id that changed group', () => {
		const prev = snap([node('x')]);
		const d = diffElements(prev, [node('a'), node('b'), edge('x', 'a', 'b')]);
		expect(d.remove).toEqual(['x']);
		expect(d.add.map((e) => e.data.id)).toEqual(['a', 'b', 'x']);
	});

	it('keeps the first of duplicate ids', () => {
		const d = diffElements(new Map(), [node('a', { label: 1 }), node('a', { label: 2 })]);
		expect(d.add).toHaveLength(1);
		expect(d.add[0].data.label).toBe(1);
	});
});

describe('placeNear', () => {
	it('uses the fallback for the first orphan', () => {
		expect(placeNear([], { x: 10, y: 20 }, 0)).toEqual({ x: 10, y: 20 });
	});

	it('spreads around the neighbours centroid', () => {
		const p = placeNear(
			[
				{ x: 0, y: 0 },
				{ x: 100, y: 0 }
			],
			{ x: 999, y: 999 },
			0,
			50
		);
		expect(Math.hypot(p.x - 50, p.y)).toBeCloseTo(50);
	});
});

describe('applyDiff (headless cytoscape)', () => {
	it('preserves positions across updates and never rebuilds', () => {
		const cy = cytoscape({ headless: true, styleEnabled: false });
		const v1 = [
			{ ...node('a', { label: 'A' }), position: { x: 10, y: 10 } } as CyElementDef,
			{ ...node('b'), position: { x: 200, y: 50 } } as CyElementDef,
			edge('e', 'a', 'b')
		];
		applyDiff(cy, diffElements(new Map(), v1));
		const aBefore = cy.getElementById('a');
		aBefore.position({ x: 42, y: 43 });

		const v2 = [
			{ ...node('a', { label: 'A2' }, ['hot']), position: { x: 0, y: 0 } } as CyElementDef,
			node('b'),
			edge('e', 'a', 'b', { label: 'rel' })
		];
		applyDiff(cy, diffElements(snap(v1), v2));
		const a = cy.getElementById('a');
		expect(a).toBe(aBefore);
		expect(a.position()).toEqual({ x: 42, y: 43 });
		expect(a.data('label')).toBe('A2');
		expect(a.hasClass('hot')).toBe(true);
		expect(cy.getElementById('e').data('label')).toBe('rel');
	});

	it('auto-places new nodes near their neighbours and reports them', () => {
		const cy = cytoscape({ headless: true, styleEnabled: false });
		const v1 = [{ ...node('a'), position: { x: 500, y: 500 } } as CyElementDef];
		applyDiff(cy, diffElements(new Map(), v1));
		const v2 = [...v1, node('b'), edge('e', 'a', 'b')];
		const placed = applyDiff(cy, diffElements(snap(v1), v2));
		expect(placed).toEqual(['b']);
		const p = cy.getElementById('b').position();
		expect(Math.hypot(p.x - 500, p.y - 500)).toBeLessThan(100);
	});

	it('skips edges with missing endpoints', () => {
		const cy = cytoscape({ headless: true, styleEnabled: false });
		applyDiff(cy, diffElements(new Map(), [node('a'), edge('e', 'a', 'ghost')]));
		expect(cy.getElementById('e').empty()).toBe(true);
	});

	it('keeps preserved transient classes on class updates', () => {
		const cy = cytoscape({ headless: true, styleEnabled: false });
		const v1 = [node('a', {}, ['x'])];
		applyDiff(cy, diffElements(new Map(), v1));
		cy.getElementById('a').addClass('hover');
		applyDiff(cy, diffElements(snap(v1), [node('a', {}, ['y'])]), ['hover']);
		const a = cy.getElementById('a');
		expect(a.hasClass('hover')).toBe(true);
		expect(a.hasClass('y')).toBe(true);
		expect(a.hasClass('x')).toBe(false);
	});

	it('removes elements', () => {
		const cy = cytoscape({ headless: true, styleEnabled: false });
		const v1 = [node('a'), node('b'), edge('e', 'a', 'b')];
		applyDiff(cy, diffElements(new Map(), v1));
		applyDiff(cy, diffElements(snap(v1), [node('a')]));
		expect(cy.elements().map((e) => e.id())).toEqual(['a']);
	});
});

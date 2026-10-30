import { describe, expect, it } from 'vitest';
import {
	clampToViewport,
	decodeDragKeys,
	encodeDragKeys,
	placeNear,
	renderedToModel
} from '../canvas';
import { GRAPH_SHORTCUTS, isTypingTarget, shortcutAction } from '../shortcuts';

const el = (tagName: string, extra: Record<string, unknown> = {}) =>
	({ tagName, getAttribute: () => null, ...extra }) as unknown as EventTarget;

describe('shortcutAction', () => {
	it('maps the single-key shortcuts', () => {
		expect(shortcutAction({ key: 'f' })).toBe('fit');
		expect(shortcutAction({ key: 'F' })).toBe('fit');
		expect(shortcutAction({ key: '/' })).toBe('search');
		expect(shortcutAction({ key: 'Delete' })).toBe('delete');
		expect(shortcutAction({ key: 'Backspace' })).toBe('delete');
		expect(shortcutAction({ key: 'Escape' })).toBe('clear');
		expect(shortcutAction({ key: 'h' })).toBe('hide');
		expect(shortcutAction({ key: 'p' })).toBe('pin');
		expect(shortcutAction({ key: 'e' })).toBe('expand');
		expect(shortcutAction({ key: '?' })).toBe('help');
		expect(shortcutAction({ key: 'x' })).toBeNull();
	});

	it('maps the modifier shortcuts (Ctrl or Cmd)', () => {
		expect(shortcutAction({ key: 'z', ctrlKey: true })).toBe('undo');
		expect(shortcutAction({ key: 'Z', metaKey: true, shiftKey: true })).toBe('redo');
		expect(shortcutAction({ key: 'y', ctrlKey: true })).toBe('redo');
		expect(shortcutAction({ key: 'a', ctrlKey: true })).toBe('select-all');
		expect(shortcutAction({ key: 'f', ctrlKey: true })).toBeNull();
		expect(shortcutAction({ key: 'z', ctrlKey: true, altKey: true })).toBeNull();
		expect(shortcutAction({ key: 'h', altKey: true })).toBeNull();
	});

	it('leaves text fields alone except for Escape', () => {
		const input = el('INPUT');
		expect(shortcutAction({ key: 'h', target: input })).toBeNull();
		expect(shortcutAction({ key: 'Delete', target: input })).toBeNull();
		expect(shortcutAction({ key: 'z', ctrlKey: true, target: input })).toBeNull();
		expect(shortcutAction({ key: 'Escape', target: input })).toBe('clear');
		expect(shortcutAction({ key: 'h', target: el('DIV') })).toBe('hide');
	});

	it('detects typing targets', () => {
		expect(isTypingTarget(null)).toBe(false);
		expect(isTypingTarget(el('TEXTAREA'))).toBe(true);
		expect(isTypingTarget(el('select'))).toBe(true);
		expect(isTypingTarget(el('DIV', { isContentEditable: true }))).toBe(true);
		expect(isTypingTarget(el('BUTTON'))).toBe(false);
		expect(isTypingTarget({} as EventTarget)).toBe(false);
	});

	it('documents every action exactly once', () => {
		const actions = GRAPH_SHORTCUTS.map((s) => s.action);
		expect(new Set(actions).size).toBe(actions.length);
		for (const a of ['fit', 'search', 'delete', 'clear', 'hide', 'pin', 'expand', 'undo', 'redo'])
			expect(actions).toContain(a);
	});
});

describe('canvas helpers', () => {
	it('round-trips dragged keys and rejects garbage', () => {
		expect(decodeDragKeys(encodeDragKeys(['asset:1', 'ioc:2']))).toEqual(['asset:1', 'ioc:2']);
		expect(decodeDragKeys('not json')).toEqual([]);
		expect(decodeDragKeys('{"a":1}')).toEqual([]);
		expect(decodeDragKeys('["a", 3, null]')).toEqual(['a']);
		expect(decodeDragKeys(null)).toEqual([]);
	});

	it('converts rendered to model coordinates', () => {
		expect(renderedToModel({ x: 110, y: 70 }, { zoom: 2, pan: { x: 10, y: -30 } })).toEqual({
			x: 50,
			y: 50
		});
	});

	it('keeps popups inside the window', () => {
		const win = { width: 800, height: 600 };
		expect(clampToViewport({ x: 790, y: 590 }, 200, 100, win)).toEqual({ x: 592, y: 492 });
		expect(clampToViewport({ x: -20, y: 3 }, 200, 100, win)).toEqual({ x: 8, y: 8 });
		expect(clampToViewport({ x: 100, y: 100 }, 200, 100, win)).toEqual({ x: 100, y: 100 });
	});
});

describe('placeNear', () => {
	const known: Record<string, { x: number; y: number }> = {
		a: { x: 0, y: 0 },
		b: { x: 200, y: 0 }
	};
	const adjacency: Record<string, string[]> = { n1: ['a', 'b'], n2: ['n1'], n3: [] };
	const neighbours = (id: string) => adjacency[id] ?? [];
	const positionOf = (id: string) => known[id] ?? null;
	const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
		Math.hypot(p.x - q.x, p.y - q.y);

	it('places a node near the centroid of its placed neighbours', () => {
		const out = placeNear(['n1'], neighbours, positionOf, { x: 1000, y: 1000 }, 50);
		expect(dist(out.n1, { x: 100, y: 0 })).toBeCloseTo(50);
	});

	it('chains on nodes placed in the same call and falls back to the given point', () => {
		const out = placeNear(['n1', 'n2', 'n3'], neighbours, positionOf, { x: 1000, y: 1000 }, 50);
		expect(dist(out.n2, out.n1)).toBeCloseTo(50);
		expect(dist(out.n3, { x: 1000, y: 1000 })).toBeCloseTo(50);
	});

	it('spreads nodes sharing an anchor', () => {
		const out = placeNear(['x', 'y', 'z'], () => ['a'], positionOf, { x: 0, y: 0 }, 50);
		expect(dist(out.x, out.y)).toBeGreaterThan(20);
		expect(dist(out.y, out.z)).toBeGreaterThan(20);
		expect(dist(out.x, out.z)).toBeGreaterThan(20);
	});
});

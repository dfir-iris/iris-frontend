import { describe, expect, it } from 'vitest';
import {
	compactState,
	copyName,
	fitSnapshot,
	groupViews,
	snapshotFits,
	stableStringify,
	stateFingerprint,
	validateViewName,
	viewPermissions,
	VIEW_SNAPSHOT_MAX
} from '../saved-views';
import { emptyViewState, parseViewState } from '../view-state';

describe('saved views', () => {
	it('stableStringify() ignores key order and undefined', () => {
		expect(stableStringify({ b: 1, a: [{ d: 2, c: undefined }] })).toBe('{"a":[{"d":2}],"b":1}');
		expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
	});

	it('fingerprints the meaningful part of a state', () => {
		const a = {
			...emptyViewState(),
			positions: { 'asset:1': { x: 10.2, y: 5.4 } },
			hidden: ['ioc:2', 'ioc:1'],
			viewport: { zoom: 1, pan: { x: 0, y: 0 } },
			custom: { x: 1 }
		};
		const b = {
			...a,
			positions: { 'asset:1': { x: 10.4, y: 4.9 } },
			hidden: ['ioc:1', 'ioc:2'],
			viewport: { zoom: 3, pan: { x: 50, y: 9 } }
		};
		expect(stateFingerprint(a)).toBe(stateFingerprint(b));
		expect(stateFingerprint(a)).not.toBe(stateFingerprint({ ...a, time: { from: 'x', to: null } }));
		expect(stateFingerprint(a)).not.toBe(stateFingerprint({ ...a, custom: { x: 2 } }));
		expect(stateFingerprint(a)).not.toBe(
			stateFingerprint({ ...a, positions: { 'asset:1': { x: 40, y: 5 } } })
		);
	});

	it('round-trips a state through JSON with the same fingerprint', () => {
		const state = parseViewState({
			layout: 'dagre',
			positions: { 'asset:1': { x: 1, y: 2 } },
			pinned: ['asset:1'],
			hidden: [],
			collapsed: [],
			filters: { show_unlinked: true },
			viewport: { zoom: 2, pan: { x: 3, y: 4 } },
			time: { from: '2024-01-01T00:00:00.000Z', to: null },
			include: ['events'],
			extra_nodes: ['ioc:9']
		});
		const back = parseViewState(JSON.parse(JSON.stringify(state)));
		expect(back).toEqual(state);
		expect(stateFingerprint(back)).toBe(stateFingerprint(state));
	});

	it('compactState() keeps the positions of the given keys', () => {
		const s = {
			...emptyViewState(),
			positions: { a: { x: 1, y: 1 }, b: { x: 2, y: 2 } }
		};
		expect(compactState(s, new Set(['b'])).positions).toEqual({ b: { x: 2, y: 2 } });
		expect(compactState(s)).toBe(s);
	});

	it('validates names', () => {
		expect(validateViewName('  ')).toMatch(/required/);
		expect(validateViewName('x'.repeat(256))).toMatch(/255/);
		expect(validateViewName(' Lateral movement ')).toBeNull();
	});

	it('checks and fits snapshots under the backend limit', () => {
		expect(snapshotFits(null)).toBe(false);
		expect(snapshotFits('data:image/jpeg;base64,AAA')).toBe(false);
		expect(snapshotFits('data:image/png;base64,AAA')).toBe(true);
		const big = `data:image/png;base64,${'A'.repeat(VIEW_SNAPSHOT_MAX)}`;
		expect(snapshotFits(big)).toBe(false);

		const calls: number[] = [];
		const png = fitSnapshot(({ scale }) => {
			calls.push(scale);
			return scale > 1 ? big : 'data:image/png;base64,OK';
		});
		expect(png).toBe('data:image/png;base64,OK');
		expect(calls).toEqual([2, 1]);
		expect(fitSnapshot(() => big, [{ scale: 1, maxWidth: 10 }])).toBeNull();
	});

	it('derives the permissions of a view', () => {
		expect(viewPermissions({ owner_id: 1, is_shared: false }, 1, true)).toEqual({
			own: true,
			modify: true,
			share: true
		});
		expect(viewPermissions({ owner_id: 2, is_shared: true }, 1, true)).toEqual({
			own: false,
			modify: true,
			share: false
		});
		expect(viewPermissions({ owner_id: 1, is_shared: true }, 1, false)).toEqual({
			own: true,
			modify: false,
			share: false
		});
		expect(viewPermissions({ owner_id: 1, is_shared: true }, null, true).own).toBe(false);
	});

	it('groups own and shared views by name', () => {
		const v = (view_id: number, owner_id: number, name: string) => ({ view_id, owner_id, name });
		const { own, shared } = groupViews(
			[v(1, 1, 'beta'), v(2, 2, 'Zed'), v(3, 1, 'Alpha'), v(4, 3, 'apple')],
			1
		);
		expect(own.map((x) => x.name)).toEqual(['Alpha', 'beta']);
		expect(shared.map((x) => x.name)).toEqual(['apple', 'Zed']);
	});

	it('names copies without clashing', () => {
		expect(copyName('A', [])).toBe('Copy of A');
		expect(copyName('A', ['copy of a'])).toBe('Copy of A (2)');
		expect(copyName('A', ['Copy of A', 'Copy of A (2)'])).toBe('Copy of A (3)');
	});
});

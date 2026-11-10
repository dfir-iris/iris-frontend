import { afterEach, describe, expect, it } from 'vitest';
import type { TrackerColumn, TrackerStep } from '$lib/services/war-room-trackers.service';
import {
	groupTrackerRows,
	loadTrackerLayout,
	nextTrackerSort,
	saveTrackerLayout,
	sortTrackerRows,
	trackerGroupIsValid,
	trackerGroupOptions,
	type TrackerLayoutContext,
	type TrackerLayoutRow
} from '../tracker-layout';

interface Row extends TrackerLayoutRow {
	name: string;
}

const row = (key: string, over: Partial<Row> = {}): Row => ({
	key,
	name: key,
	item_type: 'asset',
	item_id: Number(key.replace(/\D/g, '')) || null,
	steps: [],
	note: null,
	values: {},
	updated_at: null,
	updated_by: null,
	...over
});

const step = (id: number, name: string): TrackerStep => ({
	id,
	name,
	description: null,
	color: 'sky',
	icon: null,
	sort_order: id
});

const columns: TrackerColumn[] = [
	{ key: 'prio', label: 'Priority', type: 'select', options: ['High', 'Low'] },
	{ key: 'n', label: 'Count', type: 'number' },
	{ key: 'ok', label: 'Done', type: 'checkbox' },
	{ key: 'tags', label: 'Tags', type: 'multiselect', options: ['a', 'b'] },
	{ key: 'who', label: 'Owner', type: 'user' },
	{ key: 'long', label: 'Details', type: 'longtext' }
];

const steps = [step(1, 'Triage'), step(2, 'Contained')];

const ctx: TrackerLayoutContext<Row> = {
	label: (r) => r.name,
	itemName: (r) => r.name,
	typeLabel: (r) => (r.item_type === 'ioc' ? 'IOC' : r.item_type ? 'Asset' : 'Free text'),
	columns,
	steps,
	userName: (id) => (id === 7 ? 'Alice' : undefined)
};

const keys = (rows: Row[]) => rows.map((r) => r.key);

describe('sortTrackerRows', () => {
	it('sorts by label, naturally, both ways', () => {
		const rows = [row('a10', { name: 'srv-10' }), row('a2', { name: 'srv-2' })];
		expect(keys(sortTrackerRows(rows, { key: 'item', dir: 'asc' }, ctx))).toEqual(['a2', 'a10']);
		expect(keys(sortTrackerRows(rows, { key: 'item', dir: 'desc' }, ctx))).toEqual(['a10', 'a2']);
	});

	it('keeps empty values last in both directions', () => {
		const rows = [row('a1'), row('a2', { values: { n: 5 } }), row('a3', { values: { n: 40 } })];
		expect(keys(sortTrackerRows(rows, { key: 'col:n', dir: 'asc' }, ctx))).toEqual([
			'a2',
			'a3',
			'a1'
		]);
		expect(keys(sortTrackerRows(rows, { key: 'col:n', dir: 'desc' }, ctx))).toEqual([
			'a3',
			'a2',
			'a1'
		]);
	});

	it('sorts steps by the furthest step reached', () => {
		const rows = [
			row('a1', { steps: [{ step_id: 2, set_by: null, set_at: null }] }),
			row('a2'),
			row('a3', { steps: [{ step_id: 1, set_by: null, set_at: null }] })
		];
		expect(keys(sortTrackerRows(rows, { key: 'steps', dir: 'asc' }, ctx))).toEqual([
			'a3',
			'a1',
			'a2'
		]);
	});

	it('sorts users by name and is stable', () => {
		const rows = [row('a1', { values: { who: 7 } }), row('a2', { values: { who: 7 } })];
		expect(keys(sortTrackerRows(rows, { key: 'col:who', dir: 'desc' }, ctx))).toEqual(['a1', 'a2']);
	});

	it('leaves the rows alone without a sort or with an unknown column', () => {
		const rows = [row('a2'), row('a1')];
		expect(sortTrackerRows(rows, null, ctx)).toBe(rows);
		expect(sortTrackerRows(rows, { key: 'col:gone', dir: 'asc' }, ctx)).toBe(rows);
	});
});

describe('nextTrackerSort', () => {
	it('cycles ascending, descending, none', () => {
		expect(nextTrackerSort(null, 'item')).toEqual({ key: 'item', dir: 'asc' });
		expect(nextTrackerSort({ key: 'item', dir: 'asc' }, 'item')).toEqual({
			key: 'item',
			dir: 'desc'
		});
		expect(nextTrackerSort({ key: 'item', dir: 'desc' }, 'item')).toBeNull();
		expect(nextTrackerSort({ key: 'item', dir: 'desc' }, 'note')).toEqual({
			key: 'note',
			dir: 'asc'
		});
	});
});

describe('groupTrackerRows', () => {
	it('groups by step in step order, a row in each of its steps, "No step" last', () => {
		const rows = [
			row('a1', {
				steps: [
					{ step_id: 2, set_by: null, set_at: null },
					{ step_id: 1, set_by: null, set_at: null }
				]
			}),
			row('a2')
		];
		const groups = groupTrackerRows(rows, 'step', ctx);
		expect(groups.map((g) => [g.label, keys(g.rows)])).toEqual([
			['Triage', ['a1']],
			['Contained', ['a1']],
			['No step', ['a2']]
		]);
		expect(groups[0].step?.id).toBe(1);
		expect(groups[2].step).toBeNull();
	});

	it('groups the rows of the same item together', () => {
		const rows = [row('r1', { item_id: 4, name: 'dc01' }), row('r2', { item_id: 4, name: 'dc01' })];
		const freeText = row('r3', { item_type: null, item_id: null, name: '' });
		const groups = groupTrackerRows([...rows, freeText], 'item', ctx);
		expect(groups.map((g) => [g.label, keys(g.rows)])).toEqual([
			['dc01', ['r1', 'r2']],
			['Free text', ['r3']]
		]);
	});

	it('groups free-text rows by their text', () => {
		const text = (key: string, name: string) => row(key, { item_type: null, item_id: null, name });
		const groups = groupTrackerRows(
			[text('r1', 'rew'), text('r2', 'rew1'), text('r3', 'rew ')],
			'item',
			ctx
		);
		expect(groups.map((g) => [g.label, keys(g.rows)])).toEqual([
			['rew', ['r1', 'r3']],
			['rew1', ['r2']]
		]);
	});

	it('orders select groups by their options, the empty group last', () => {
		const rows = [
			row('a1', { values: { prio: 'Low' } }),
			row('a2'),
			row('a3', { values: { prio: 'High' } })
		];
		expect(groupTrackerRows(rows, 'col:prio', ctx).map((g) => g.label)).toEqual([
			'High',
			'Low',
			'No Priority'
		]);
	});

	it('splits multi-selects and names users and checkboxes', () => {
		const rows = [row('a1', { values: { tags: ['b', 'a'], ok: true, who: 7 } }), row('a2')];
		expect(groupTrackerRows(rows, 'col:tags', ctx).map((g) => g.label)).toEqual([
			'a',
			'b',
			'No Tags'
		]);
		expect(groupTrackerRows(rows, 'col:ok', ctx).map((g) => g.label)).toEqual(['Yes', 'No']);
		expect(groupTrackerRows(rows, 'col:who', ctx).map((g) => g.label)).toEqual([
			'Alice',
			'No Owner'
		]);
	});

	it('groups by who updated last', () => {
		const rows = [row('a1', { updated_by: { id: 3, name: 'Bob' } }), row('a2')];
		expect(groupTrackerRows(rows, 'updated_by', ctx).map((g) => g.label)).toEqual([
			'Bob',
			'Never updated'
		]);
	});
});

describe('trackerGroupOptions', () => {
	it('offers item groupings to manual trackers only, and no long text', () => {
		const manual = trackerGroupOptions(columns, { manual: true }).map((o) => o.value);
		expect(manual).toContain('item');
		expect(manual).not.toContain('col:long');
		expect(trackerGroupOptions(columns, { manual: false }).map((o) => o.value)).not.toContain(
			'item'
		);
		expect(trackerGroupIsValid('col:prio', columns, false)).toBe(true);
		expect(trackerGroupIsValid('col:gone', columns, true)).toBe(false);
		expect(trackerGroupIsValid(null, columns, true)).toBe(false);
	});
});

describe('tracker layout memory', () => {
	afterEach(() => localStorage.clear());

	it('remembers and forgets a layout', () => {
		saveTrackerLayout('case-1', { sort: { key: 'note', dir: 'desc' }, group: 'step' });
		expect(loadTrackerLayout('case-1')).toEqual({
			sort: { key: 'note', dir: 'desc' },
			group: 'step'
		});
		saveTrackerLayout('case-1', { sort: null, group: null });
		expect(loadTrackerLayout('case-1')).toEqual({ sort: null, group: null });
	});

	it('ignores a corrupted entry', () => {
		localStorage.setItem('iris_tracker_layout_case-2', '{"sort":{"key":1},"group":3}');
		expect(loadTrackerLayout('case-2')).toEqual({ sort: null, group: null });
		localStorage.setItem('iris_tracker_layout_case-3', 'not json');
		expect(loadTrackerLayout('case-3')).toEqual({ sort: null, group: null });
	});
});

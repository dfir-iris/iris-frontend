import { describe, expect, it } from 'vitest';
import type { TrackerRow } from '$lib/services/war-room-trackers.service';
import {
	describeTrackerEvent,
	isTrackerView,
	trackerBoardColumns,
	trackerBoardMove,
	trackerItemCounts
} from '../tracker-helpers';

describe('describeTrackerEvent', () => {
	const steps = [
		{ id: 3, name: 'Email sent', description: null, color: 'sky', icon: 'mail', sort_order: 0 }
	];

	it('names the step from the details, else from the war-room steps', () => {
		expect(
			describeTrackerEvent({ action: 'step_added', details: { step_id: 3, step_name: 'Old' } })
		).toBe('added step Old');
		expect(
			describeTrackerEvent({ action: 'step_removed', details: { step_id: 3 } }, { steps })
		).toBe('removed step Email sent');
		expect(describeTrackerEvent({ action: 'step_added', details: { step_id: 9 } })).toBe(
			'added step #9'
		);
	});

	it('describes value changes with the column label', () => {
		expect(
			describeTrackerEvent(
				{ action: 'value_changed', details: { column_key: 'c_owner', old: null, new: 'Bob' } },
				{ columns: [{ key: 'c_owner', label: 'Owner', type: 'text' }] }
			)
		).toBe('set Owner to "Bob"');
		expect(
			describeTrackerEvent({
				action: 'value_changed',
				details: { column_key: 'c_x', column_label: 'X', old: 'a', new: null }
			})
		).toBe('cleared X');
	});

	it('describes notes, labels and unknown actions', () => {
		expect(describeTrackerEvent({ action: 'note_changed', details: { new: '' } })).toBe(
			'cleared the note'
		);
		expect(describeTrackerEvent({ action: 'label_changed', details: { old: 'a', new: 'b' } })).toBe(
			'renamed "a" to "b"'
		);
		expect(
			describeTrackerEvent({ action: 'label_changed', details: { old: null, new: 'b' } })
		).toBe('labelled the row "b"');
		expect(
			describeTrackerEvent({ action: 'label_changed', details: { old: 'a', new: null } })
		).toBe('removed the label "a"');
		expect(describeTrackerEvent({ action: 'row_moved', details: null })).toBe('row moved');
	});
});

describe('tracker board', () => {
	const step = (id: number, name: string) => ({
		id,
		name,
		description: null,
		color: 'sky',
		icon: null,
		sort_order: id
	});
	const row = (key: string, stepIds: number[]) =>
		({
			key,
			steps: stepIds.map((step_id) => ({ step_id, set_by: null, set_at: null }))
		}) as unknown as TrackerRow;
	const ROWS = [row('a', []), row('b', [1]), row('c', [1, 2]), row('d', [9])];

	it('puts each row in the column of every listed step it carries', () => {
		const cols = trackerBoardColumns(ROWS, [step(1, 'Contacted'), step(2, 'Acknowledged')]);
		expect(cols.map((c) => [c.key, c.rows.map((r) => r.key)])).toEqual([
			// d only carries a step that is not listed.
			['none', ['a', 'd']],
			['1', ['b', 'c']],
			['2', ['c']]
		]);
		expect(trackerBoardColumns([], [])).toEqual([{ key: 'none', step: null, rows: [] }]);
	});

	it('moves a card: drops the step it came from, adds the new one', () => {
		expect(trackerBoardMove(ROWS[1], 1, 2)).toEqual({ add_step_ids: [2], remove_step_ids: [1] });
		expect(trackerBoardMove(ROWS[0], null, 2)).toEqual({ add_step_ids: [2], remove_step_ids: [] });
		expect(trackerBoardMove(ROWS[2], 1, null)).toEqual({ add_step_ids: [], remove_step_ids: [1] });
		// Already carrying the target step: only the source one goes.
		expect(trackerBoardMove(ROWS[2], 2, 1)).toEqual({ add_step_ids: [], remove_step_ids: [2] });
		expect(trackerBoardMove(ROWS[1], 1, 1)).toBeNull();
		expect(trackerBoardMove(ROWS[0], 5, null)).toBeNull();
	});

	it('tells the views apart', () => {
		expect(isTrackerView('board')).toBe(true);
		expect(isTrackerView('list')).toBe(true);
		expect(isTrackerView('table')).toBe(false);
		expect(isTrackerView(null)).toBe(false);
	});
});

describe('trackerItemCounts', () => {
	it('counts the rows of each item, not the free-text ones', () => {
		const counts = trackerItemCounts([
			{ item_type: 'asset', item_id: 1 },
			{ item_type: 'asset', item_id: 1 },
			{ item_type: 'ioc', item_id: 1 },
			{ item_type: null, item_id: null }
		]);
		expect([...counts]).toEqual([
			['asset:1', 2],
			['ioc:1', 1]
		]);
	});
});

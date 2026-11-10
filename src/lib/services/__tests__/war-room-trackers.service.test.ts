import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api.service', () => ({
	ApiService: {
		withQuery: vi.fn((path: string, params?: Record<string, unknown>) => {
			const qs = new URLSearchParams();
			for (const [k, v] of Object.entries(params ?? {})) {
				if (v !== undefined && v !== null) qs.set(k, String(v));
			}
			const tail = qs.toString();
			return tail ? `${path}?${tail}` : path;
		}),
		get: vi.fn(),
		post: vi.fn(),
		put: vi.fn(),
		patch: vi.fn(),
		delete: vi.fn()
	}
}));

import {
	WarRoomTrackersService,
	filterTrackerRows,
	mergeTrackerRows,
	newTrackerColumnKey,
	normalizeTrackerTimelineSync,
	sortTrackerSteps,
	trackerIdFromTab,
	trackerOfferedSteps,
	trackerItemName,
	trackerRowLabel,
	trackerRowRef,
	trackerStepCounts,
	trackerTabKey,
	trackerTimelineDateColumns,
	trackerTimelineSyncTitle,
	trackerTimelineWarning,
	trackerValueText,
	type TrackerColumn,
	type TrackerRow,
	type TrackerStep
} from '../war-room-trackers.service';
import { ApiService } from '../api.service';

const mock = (method: keyof typeof ApiService) =>
	ApiService[method] as unknown as ReturnType<typeof vi.fn>;

const row = (over: Partial<TrackerRow> = {}): TrackerRow => ({
	row_id: null,
	key: 'asset:1',
	item_type: 'asset',
	item_id: 1,
	label: null,
	item: null,
	restricted: false,
	steps: [],
	note: null,
	values: {},
	updated_at: null,
	updated_by: null,
	...over
});

const step = (id: number, sort_order: number, name = `S${id}`): TrackerStep => ({
	id,
	name,
	description: null,
	color: 'slate',
	icon: null,
	sort_order
});

describe('WarRoomTrackersService', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mock('get').mockResolvedValue({ ok: true, status: 200, data: [] });
		mock('post').mockResolvedValue({ ok: true, status: 200, data: {} });
		mock('patch').mockResolvedValue({ ok: true, status: 200, data: {} });
		mock('delete').mockResolvedValue({ ok: true, status: 204, data: null });
	});

	describe('steps', () => {
		it('lists, creates, updates, removes and reorders', async () => {
			await WarRoomTrackersService.listSteps(3);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/3/tracker-steps', {});

			await WarRoomTrackersService.createStep(3, { name: 'Isolated', color: 'red' });
			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/3/tracker-steps',
				{ name: 'Isolated', color: 'red' },
				{}
			);

			await WarRoomTrackersService.updateStep(3, 8, { icon: 'unplug' });
			expect(ApiService.patch).toHaveBeenCalledWith(
				'/war-rooms/3/tracker-steps/8',
				{ icon: 'unplug' },
				{}
			);

			await WarRoomTrackersService.removeStep(3, 8);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/3/tracker-steps/8', {});

			await WarRoomTrackersService.reorderSteps(3, [2, 1]);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/3/tracker-steps/reorder',
				{ ids: [2, 1] },
				{}
			);
		});
	});

	describe('trackers', () => {
		it('hits the tracker endpoints', async () => {
			const opts = { skipTokenRefresh: true };
			await WarRoomTrackersService.list(3, opts);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/3/trackers', opts);

			await WarRoomTrackersService.get(3, 5);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/3/trackers/5', {});

			const body = { name: 'Notify', source: 'customers' as const, show_asset_flags: false };
			await WarRoomTrackersService.create(3, body);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/3/trackers', body, {});

			await WarRoomTrackersService.update(3, 5, { name: 'Renamed', step_ids: null });
			expect(ApiService.patch).toHaveBeenCalledWith(
				'/war-rooms/3/trackers/5',
				{ name: 'Renamed', step_ids: null },
				{}
			);

			await WarRoomTrackersService.remove(3, 5);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/3/trackers/5', {});

			await WarRoomTrackersService.reorder(3, [5, 4]);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/3/trackers/reorder',
				{ ids: [5, 4] },
				{}
			);
		});
	});

	describe('rows', () => {
		it('lists, adds, updates state, removes and reorders rows', async () => {
			await WarRoomTrackersService.listRows(3, 5);
			expect(ApiService.get).toHaveBeenCalledWith('/war-rooms/3/trackers/5/rows', {});

			const add = {
				rows: [{ label: 'Branch office' }, { item_type: 'case' as const, item_id: 9 }]
			};
			await WarRoomTrackersService.addRows(3, 5, add);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/3/trackers/5/rows', add, {});

			const state = { rows: [{ row_id: 12 }], add_step_ids: [1], note: 'called' };
			await WarRoomTrackersService.updateState(3, 5, state);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/3/trackers/5/rows/state', state, {});

			await WarRoomTrackersService.removeRow(3, 5, 12);
			expect(ApiService.delete).toHaveBeenCalledWith('/war-rooms/3/trackers/5/rows/12', {});

			await WarRoomTrackersService.reorderRows(3, 5, [12, 11]);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/3/trackers/5/rows/reorder',
				{ ids: [12, 11] },
				{}
			);
		});

		it('reads the history of the tracker, a row or an item', async () => {
			await WarRoomTrackersService.history(3, 5);
			expect(ApiService.get).toHaveBeenLastCalledWith('/war-rooms/3/trackers/5/rows/history', {});

			await WarRoomTrackersService.history(3, 5, { row_id: 12 });
			expect(ApiService.get).toHaveBeenLastCalledWith(
				'/war-rooms/3/trackers/5/rows/history?row_id=12',
				{}
			);

			await WarRoomTrackersService.history(3, 5, { item_type: 'asset', item_id: 44 });
			expect(ApiService.get).toHaveBeenLastCalledWith(
				'/war-rooms/3/trackers/5/rows/history?item_type=asset&item_id=44',
				{}
			);
		});
	});

	describe('timeline', () => {
		it('writes the state of the rows to the timelines', async () => {
			await WarRoomTrackersService.syncTimeline(3, 5);
			expect(ApiService.post).toHaveBeenCalledWith('/war-rooms/3/trackers/5/timeline/sync', {}, {});
		});

		it('sends the timeline settings with the tracker', async () => {
			const timeline_sync = {
				mode: 'changes' as const,
				target: 'cases' as const,
				date: 'c_due',
				war_room_timeline_id: null
			};
			await WarRoomTrackersService.update(3, 5, { timeline_sync });
			expect(ApiService.patch).toHaveBeenCalledWith(
				'/war-rooms/3/trackers/5',
				{ timeline_sync },
				{}
			);
		});
	});

	describe('templates', () => {
		it('applies a template and saves the room as one', async () => {
			await WarRoomTrackersService.applyTemplate(3, 7);
			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/3/trackers/apply-template',
				{ template_id: 7 },
				{}
			);

			await WarRoomTrackersService.saveAsTemplate(3, { name: 'Mine', tracker_ids: [5] });
			expect(ApiService.post).toHaveBeenCalledWith(
				'/war-rooms/3/trackers/save-as-template',
				{ name: 'Mine', tracker_ids: [5] },
				{}
			);
		});
	});
});

describe('tracker helpers', () => {
	it('builds and parses tab keys', () => {
		expect(trackerTabKey(12)).toBe('tracker-12');
		expect(trackerIdFromTab('tracker-12')).toBe(12);
		expect(trackerIdFromTab('tracker-0')).toBeNull();
		expect(trackerIdFromTab('tracker-1x')).toBeNull();
		expect(trackerIdFromTab('assets')).toBeNull();
		expect(trackerIdFromTab(null)).toBeNull();
	});

	it('sorts steps and keeps the offered subset in order', () => {
		const steps = [step(1, 2), step(2, 0), step(3, 1)];
		expect(sortTrackerSteps(steps).map((s) => s.id)).toEqual([2, 3, 1]);
		expect(trackerOfferedSteps({ step_ids: null }, steps).map((s) => s.id)).toEqual([2, 3, 1]);
		expect(trackerOfferedSteps({ step_ids: [1, 2] }, steps).map((s) => s.id)).toEqual([2, 1]);
	});

	it('addresses stored rows by id, mirrored items by type and id', () => {
		expect(trackerRowRef(row({ item_type: 'ioc', item_id: 4 }))).toEqual({
			item_type: 'ioc',
			item_id: 4
		});
		// An item can have several rows: the stored one is addressed by id.
		expect(trackerRowRef(row({ item_type: 'ioc', item_id: 4, row_id: 7 }))).toEqual({
			row_id: 7
		});
		expect(trackerRowRef(row({ item_type: null, item_id: null, row_id: 9 }))).toEqual({
			row_id: 9
		});
		expect(trackerRowRef(row({ item_type: null, item_id: null, row_id: null }))).toBeNull();
	});

	it('labels rows by item, free text or placeholder', () => {
		expect(
			trackerRowLabel(
				row({
					item: {
						asset_id: 1,
						asset_name: 'srv-01',
						asset_type: null,
						case_id: 2,
						case_name: null,
						customer_id: null,
						customer_name: null,
						compromise_status_id: null,
						analysis_status_id: null,
						flags: []
					}
				})
			)
		).toBe('srv-01');
		expect(trackerRowLabel(row({ item_type: null, item_id: null, label: 'Call HQ' }))).toBe(
			'Call HQ'
		);
		expect(trackerRowLabel(row({ restricted: true }))).toBe('Restricted item');
		expect(trackerRowLabel(row({ item_type: 'case', item_id: 3 }))).toBe('Case #3');
	});

	it('puts the custom label of an item row before the item name', () => {
		const labelled = row({ item_type: 'case', item_id: 3, custom_label: 'Pilot' });
		expect(trackerRowLabel(labelled)).toBe('Pilot (Case #3)');
		expect(trackerItemName(labelled)).toBe('Case #3');
	});

	it('counts rows per step and without step', () => {
		const rows = [
			row({ steps: [{ step_id: 1, set_by: null, set_at: null }] }),
			row({
				steps: [
					{ step_id: 1, set_by: null, set_at: null },
					{ step_id: 2, set_by: null, set_at: null }
				]
			}),
			row()
		];
		const counts = trackerStepCounts(rows);
		expect(counts.byStep.get(1)).toBe(2);
		expect(counts.byStep.get(2)).toBe(1);
		expect(counts.none).toBe(1);
	});

	it('renders values as text', () => {
		expect(trackerValueText(null)).toBe('');
		expect(trackerValueText(['a', 'b'])).toBe('a, b');
		expect(trackerValueText(true)).toBe('Yes');
		expect(trackerValueText(4, { type: 'user' }, (id) => (id === 4 ? 'Ana' : null))).toBe('Ana');
		expect(trackerValueText(5, { type: 'user' }, () => null)).toBe('User #5');
		expect(trackerValueText(3.5, { type: 'number' })).toBe('3.5');
	});

	it('filters rows by text and step', () => {
		const rows = [
			row({ key: 'a', label: 'Lyon office', steps: [{ step_id: 1, set_by: null, set_at: null }] }),
			row({ key: 'b', label: 'Paris', note: 'called twice' }),
			row({ key: 'c', label: 'Nice', values: { c_owner: 'Bob' } })
		].map((r) => ({ ...r, item_type: null, item_id: null }));
		const cols = [{ key: 'c_owner', label: 'Owner', type: 'text' as const }];
		expect(filterTrackerRows(rows, { q: 'lyon' }).map((r) => r.key)).toEqual(['a']);
		expect(filterTrackerRows(rows, { q: 'TWICE' }).map((r) => r.key)).toEqual(['b']);
		expect(filterTrackerRows(rows, { q: 'bob' }, cols).map((r) => r.key)).toEqual(['c']);
		expect(filterTrackerRows(rows, { step: 1 }).map((r) => r.key)).toEqual(['a']);
		expect(filterTrackerRows(rows, { step: 'none' }).map((r) => r.key)).toEqual(['b', 'c']);
		expect(filterTrackerRows(rows, {}).length).toBe(3);
	});

	it('makes unique column keys', () => {
		expect(newTrackerColumnKey('Notified at')).toBe('c_notified_at');
		expect(newTrackerColumnKey('Owner', ['c_owner'])).toBe('c_owner_2');
		expect(newTrackerColumnKey('Owner', ['c_owner', 'c_owner_2'])).toBe('c_owner_3');
		expect(newTrackerColumnKey('!!!')).toBe('c_col');
	});

	it('merges updated rows by key', () => {
		const rows = [row({ key: 'a' }), row({ key: 'b' })];
		const merged = mergeTrackerRows(rows, [row({ key: 'b', note: 'x' })]);
		expect(merged.map((r) => r.note)).toEqual([null, 'x']);
		expect(mergeTrackerRows(rows, [])).toBe(rows);
	});
});

describe('tracker timeline helpers', () => {
	const columns: TrackerColumn[] = [
		{ key: 'c_due', label: 'Due', type: 'date' },
		{ key: 'c_at', label: 'At', type: 'datetime' },
		{ key: 'c_ticket', label: 'Ticket', type: 'text' }
	];
	const sync = {
		mode: 'state' as const,
		target: 'cases' as const,
		date: 'c_due',
		war_room_timeline_id: null
	};

	it('offers the date and datetime columns', () => {
		expect(trackerTimelineDateColumns(columns).map((c) => c.key)).toEqual(['c_due', 'c_at']);
	});

	it('falls back to the change time when the date column is gone', () => {
		expect(normalizeTrackerTimelineSync(null, columns)).toBeNull();
		expect(normalizeTrackerTimelineSync(sync, columns)).toBe(sync);
		expect(normalizeTrackerTimelineSync(sync, columns.slice(1))?.date).toBe('changed_at');
		expect(normalizeTrackerTimelineSync({ ...sync, date: 'c_ticket' }, columns)?.date).toBe(
			'changed_at'
		);
	});

	it('warns about what was not written', () => {
		expect(trackerTimelineWarning(undefined)).toBeNull();
		expect(
			trackerTimelineWarning({
				events: 2,
				skipped_case_ids: [],
				restricted_rows: 0,
				war_room_rows: 0
			})
		).toBeNull();
		expect(
			trackerTimelineWarning({
				events: 0,
				skipped_case_ids: [4, 9],
				restricted_rows: 1,
				war_room_rows: 0
			})
		).toBe('2 case timelines not written (no full access: #4, #9); 1 restricted row not written.');
		expect(
			trackerTimelineWarning({
				events: 0,
				skipped_case_ids: [4],
				restricted_rows: 0,
				war_room_rows: 0
			})
		).toBe('1 case timeline not written (no full access: #4).');
		expect(
			trackerTimelineWarning({
				events: 2,
				skipped_case_ids: [],
				restricted_rows: 0,
				war_room_rows: 2
			})
		).toBe('2 rows without a case written to the war-room timeline.');
		expect(
			trackerTimelineWarning({
				events: 0,
				skipped_case_ids: [],
				restricted_rows: 0,
				war_room_rows: 0,
				remaining: 0,
				remaining_restricted: 3
			})
		).toBe('3 past changes of rows you cannot see left for the members who can.');
	});

	it('titles a sync with what is left of the past changes', () => {
		const summary = { events: 1, skipped_case_ids: [], restricted_rows: 0, war_room_rows: 0 };
		expect(trackerTimelineSyncTitle(summary)).toBe('1 timeline event written');
		expect(trackerTimelineSyncTitle({ ...summary, events: 2000, remaining: 0 })).toBe(
			'2000 timeline events written'
		);
		expect(trackerTimelineSyncTitle({ ...summary, events: 2000, remaining: 1 })).toBe(
			'2000 timeline events written, 1 past change left'
		);
	});
});

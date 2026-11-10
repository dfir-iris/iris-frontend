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
	CaseTrackersService,
	caseTrackerExportColumns,
	caseTrackerItemHref,
	caseTrackerItemName,
	caseTrackerRowLabel,
	caseTrackerRowRef,
	caseTrackerTimelineSyncTitle,
	filterCaseTrackerRows,
	type CaseTrackerRow
} from '../case-trackers.service';
import { ApiService } from '../api.service';

const row = (overrides: Partial<CaseTrackerRow> = {}): CaseTrackerRow => ({
	row_id: null,
	key: 'asset:10',
	item_type: 'asset',
	item_id: 10,
	label: null,
	item: {
		asset_id: 10,
		asset_name: 'dc01',
		asset_type: 'Windows - DC',
		asset_ip: '10.0.0.1',
		asset_domain: null,
		compromise_status_id: null,
		analysis_status_id: null,
		analysis_status_name: null,
		flags: [{ flag_id: 3, reason: null, set_at: null }]
	},
	restricted: false,
	steps: [],
	note: null,
	values: {},
	updated_at: null,
	updated_by: null,
	...overrides
});

const task = row({
	key: 'task:4',
	item_type: 'task',
	item_id: 4,
	item: {
		task_id: 4,
		task_title: 'Collect THOR',
		status_id: 1,
		status_name: 'To do',
		status_color: null,
		assignees: [{ id: 2, name: 'Alice' }],
		open_date: null,
		close_date: null
	}
});

describe('case tracker helpers', () => {
	it('names a row by its item, its label, or a placeholder', () => {
		expect(caseTrackerRowLabel(row())).toBe('dc01');
		expect(caseTrackerRowLabel(task)).toBe('Collect THOR');
		expect(
			caseTrackerRowLabel(
				row({ item_type: null, item_id: null, item: null, label: 'Call the CERT' })
			)
		).toBe('Call the CERT');
		expect(caseTrackerRowLabel(row({ restricted: true, item: null }))).toBe('Deleted item');
		expect(caseTrackerRowLabel(row({ item: null }))).toBe('Asset #10');
	});

	it('puts the custom label of an item row before the item name', () => {
		expect(caseTrackerRowLabel(row({ custom_label: 'Patient zero' }))).toBe('Patient zero (dc01)');
		expect(caseTrackerItemName(row({ custom_label: 'Patient zero' }))).toBe('dc01');
		expect(
			caseTrackerRowLabel(row({ restricted: true, item: null, custom_label: 'Patient zero' }))
		).toBe('Patient zero (Deleted item)');
	});

	it('addresses stored rows by id, mirrored items by type and id', () => {
		expect(caseTrackerRowRef(row())).toEqual({ item_type: 'asset', item_id: 10 });
		// An item can have several rows: the stored one is addressed by id.
		expect(caseTrackerRowRef(row({ row_id: 7 }))).toEqual({ row_id: 7 });
		expect(caseTrackerRowRef(row({ row_id: 5, item_type: null, item_id: null }))).toEqual({
			row_id: 5
		});
		expect(caseTrackerRowRef(row({ item_type: null, item_id: null }))).toBeNull();
	});

	it('links to the case items', () => {
		expect(caseTrackerItemHref(3, row())).toBe('/case/3/assets/10');
		expect(caseTrackerItemHref(3, task)).toBe('/case/3/tasks/4');
		expect(caseTrackerItemHref(3, { item_type: 'evidence', item_id: 8, restricted: false })).toBe(
			'/case/3/evidence/8'
		);
		expect(caseTrackerItemHref(3, row({ restricted: true }))).toBeNull();
		expect(caseTrackerItemHref(3, row({ item_type: null, item_id: null }))).toBeNull();
	});

	it('filters by search (item fields, assignees, note) and step', () => {
		const rows = [row({ note: 'Waiting for THOR' }), task];
		expect(filterCaseTrackerRows(rows, { q: '10.0.0.1' }).map((r) => r.key)).toEqual(['asset:10']);
		expect(filterCaseTrackerRows(rows, { q: 'alice' }).map((r) => r.key)).toEqual(['task:4']);
		expect(filterCaseTrackerRows(rows, { q: 'thor' })).toHaveLength(2);
		const stepped = [row({ steps: [{ step_id: 1, set_by: null, set_at: null }] }), task];
		expect(filterCaseTrackerRows(stepped, { step: 1 }).map((r) => r.key)).toEqual(['asset:10']);
		expect(filterCaseTrackerRows(stepped, { step: 'none' }).map((r) => r.key)).toEqual(['task:4']);
	});

	it('tells what a timeline sync wrote', () => {
		expect(caseTrackerTimelineSyncTitle({ events: 1 })).toBe('1 timeline event written');
		expect(caseTrackerTimelineSyncTitle({ events: 2, remaining: 3 })).toBe(
			'2 timeline events written, 3 past changes left'
		);
	});

	it('exports the flags only when the tracker shows them', () => {
		const steps = [
			{ id: 1, name: 'Received', description: null, color: 'green', icon: null, sort_order: 0 }
		];
		const keys = (show: boolean) =>
			caseTrackerExportColumns(
				{ columns: [], show_asset_flags: show },
				steps,
				() => '',
				() => ''
			).map((c) => c.key);
		expect(keys(false)).not.toContain('flags');
		const cols = caseTrackerExportColumns(
			{ columns: [], show_asset_flags: true },
			steps,
			(id) => `Flag ${id}`,
			() => ''
		);
		const flags = cols.find((c) => c.key === 'flags');
		expect(flags?.getter(row())).toBe('Flag 3');
		expect(cols.find((c) => c.key === 'item_type')?.getter(task)).toBe('Task');
	});
});

describe('CaseTrackersService', () => {
	beforeEach(() => vi.clearAllMocks());

	it('reads the rows and history of a case tracker', async () => {
		await CaseTrackersService.listRows(3, 7);
		expect(ApiService.get).toHaveBeenCalledWith('/cases/3/trackers/7/rows', {});
		await CaseTrackersService.history(3, 7, { item_type: 'task', item_id: 4 });
		expect(ApiService.get).toHaveBeenCalledWith(
			'/cases/3/trackers/7/rows/history?item_type=task&item_id=4',
			{}
		);
	});

	it('posts state changes, templates and timeline syncs', async () => {
		await CaseTrackersService.updateState(3, 7, { rows: [{ row_id: 1 }], note: 'x' });
		expect(ApiService.post).toHaveBeenCalledWith(
			'/cases/3/trackers/7/rows/state',
			{ rows: [{ row_id: 1 }], note: 'x' },
			{}
		);
		await CaseTrackersService.applyTemplate(3, 9);
		expect(ApiService.post).toHaveBeenCalledWith(
			'/cases/3/trackers/apply-template',
			{ template_id: 9 },
			{}
		);
		await CaseTrackersService.syncTimeline(3, 7);
		expect(ApiService.post).toHaveBeenCalledWith('/cases/3/trackers/7/timeline/sync', {}, {});
		await CaseTrackersService.reorderSteps(3, [2, 1]);
		expect(ApiService.post).toHaveBeenCalledWith(
			'/cases/3/tracker-steps/reorder',
			{ ids: [2, 1] },
			{}
		);
	});
});

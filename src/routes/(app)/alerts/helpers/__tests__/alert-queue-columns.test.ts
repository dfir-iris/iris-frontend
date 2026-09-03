import { describe, expect, it } from 'vitest';
import {
	ALERT_QUEUE_COLUMNS,
	DEFAULT_ALERT_SORT,
	alertSortArrow,
	parseAlertSort,
	toggleAlertSort,
	type AlertSortState
} from '../alert-queue-columns';

describe('toggleAlertSort', () => {
	it('reverses the column that is already being sorted on', () => {
		const sort: AlertSortState = { column: 'title', dir: 'asc' };

		expect(toggleAlertSort(sort, 'title')).toEqual({ column: 'title', dir: 'desc' });
		expect(toggleAlertSort({ column: 'title', dir: 'desc' }, 'title')).toEqual({
			column: 'title',
			dir: 'asc'
		});
	});

	it('opens a new column in the direction worth seeing first', () => {
		const sort: AlertSortState = { column: 'title', dir: 'asc' };

		// Most severe and most recent are the useful ends of these two.
		expect(toggleAlertSort(sort, 'severity')).toEqual({ column: 'severity', dir: 'desc' });
		expect(toggleAlertSort(sort, 'event_time')).toEqual({ column: 'event_time', dir: 'desc' });
		// Names read A→Z.
		expect(toggleAlertSort(sort, 'customer_name')).toEqual({
			column: 'customer_name',
			dir: 'asc'
		});
	});

	it('does not carry the previous direction over to the new column', () => {
		const sort: AlertSortState = { column: 'event_time', dir: 'asc' };

		expect(toggleAlertSort(sort, 'customer_name').dir).toBe('asc');
		expect(toggleAlertSort({ column: 'customer_name', dir: 'desc' }, 'event_time').dir).toBe(
			'desc'
		);
	});
});

describe('alertSortArrow', () => {
	it('marks only the active column', () => {
		const sort: AlertSortState = { column: 'status', dir: 'asc' };

		expect(alertSortArrow(sort, 'status')).toBe('▲');
		expect(alertSortArrow(sort, 'title')).toBe('');
	});

	it('points down when the sort is descending', () => {
		expect(alertSortArrow({ column: 'event_time', dir: 'desc' }, 'event_time')).toBe('▼');
	});
});

describe('parseAlertSort', () => {
	it('accepts every column the queue offers', () => {
		for (const column of ALERT_QUEUE_COLUMNS) {
			expect(parseAlertSort(column.id, 'asc')).toEqual({ column: column.id, dir: 'asc' });
		}
	});

	it('falls back to the default for a column the queue cannot draw', () => {
		expect(parseAlertSort('alert_uuid', 'asc')).toEqual({
			column: DEFAULT_ALERT_SORT.column,
			dir: 'asc'
		});
	});

	it('falls back to the default direction for anything that is not asc or desc', () => {
		expect(parseAlertSort('title', 'sideways')).toEqual({
			column: 'title',
			dir: DEFAULT_ALERT_SORT.dir
		});
		expect(parseAlertSort(undefined, undefined)).toEqual(DEFAULT_ALERT_SORT);
	});
});

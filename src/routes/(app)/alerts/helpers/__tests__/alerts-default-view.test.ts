import { describe, expect, it } from 'vitest';
import type { AlertStatus } from '$lib/services/alert-status.service';
import type { SavedFilter } from '$lib/services/alerts-filters.service';
import { UNASSIGNED_OWNER_ID } from '../../components/AlertsBoard/board-config';
import { defaultFilters } from '../../components/AlertFilters/filters';
import { buildDefaultAlertFilters } from '../alerts-default-view';

// These cases are about what a view *adds* to the baseline query, not
// about what the baseline ordering happens to be, so they build on the
// defaults rather than restating them.
const base = defaultFilters();

const alertStatuses: AlertStatus[] = [
	{ status_id: 1, status_name: 'New' },
	{ status_id: 4, status_name: 'Closed' },
	{ status_id: 5, status_name: 'Merged' }
];

const OPEN_CONDITION = JSON.stringify([
	{ field: 'alert_status_id', operator: 'not_in', value: [4, 5] }
]);

const preset: SavedFilter = {
	filter_id: 3,
	filter_is_private: true,
	filter_type: 'alerts',
	filter_name: 'High severity',
	filter_data: [{ alert_severity_id: 5, sort: 'asc' }]
};

describe('buildDefaultAlertFilters', () => {
	it('leaves the query unfiltered for the "all" view', () => {
		expect(buildDefaultAlertFilters({ mode: 'all' }, { alertStatuses })).toEqual(base);
	});

	it('excludes terminal statuses for the "open" view', () => {
		expect(buildDefaultAlertFilters({ mode: 'open' }, { alertStatuses })).toEqual({
			...base,
			custom_conditions: OPEN_CONDITION
		});
	});

	it('scopes the open queue to the current user for "mine"', () => {
		expect(buildDefaultAlertFilters({ mode: 'mine' }, { alertStatuses, currentUserId: 8 })).toEqual(
			{
				...base,
				custom_conditions: OPEN_CONDITION,
				alert_owner_id: 8
			}
		);
	});

	it('falls back to the plain open queue when the current user is unknown', () => {
		expect(buildDefaultAlertFilters({ mode: 'mine' }, { alertStatuses })).toEqual({
			...base,
			custom_conditions: OPEN_CONDITION
		});
	});

	it('uses the unassigned sentinel for "unassigned"', () => {
		expect(buildDefaultAlertFilters({ mode: 'unassigned' }, { alertStatuses })).toEqual({
			...base,
			custom_conditions: OPEN_CONDITION,
			alert_owner_id: UNASSIGNED_OWNER_ID
		});
	});

	it('applies a saved preset', () => {
		const filters = buildDefaultAlertFilters(
			{ mode: 'preset', filter_id: 3 },
			{ alertStatuses, preset }
		);

		expect(filters.alert_severity_id).toBe(5);
		expect(filters.sort).toBe('asc');
	});

	it('falls back to an unfiltered view when the preset is gone', () => {
		expect(
			buildDefaultAlertFilters({ mode: 'preset', filter_id: 3 }, { alertStatuses, preset: null })
		).toEqual(base);
	});

	it('degrades to an unfiltered view when the status lookup is empty', () => {
		expect(buildDefaultAlertFilters({ mode: 'open' }, { alertStatuses: [] })).toEqual({
			...base,
			custom_conditions: undefined
		});
	});
});

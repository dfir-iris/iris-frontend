import { describe, expect, it } from 'vitest';
import type { SavedFilter } from '$lib/services/alerts-filters.service';
import { defaultFilters } from '../../components/AlertFilters/filters';
import { buildDefaultAlertFilters } from '../alerts-default-view';

// These cases are about what a view *adds* to the baseline query, not
// about what the baseline ordering happens to be, so they build on the
// defaults rather than restating them.
const base = defaultFilters();

const preset: SavedFilter = {
	filter_id: 3,
	filter_is_private: true,
	filter_type: 'alerts',
	filter_name: 'High severity',
	filter_data: [{ alert_severity_id: 5, sort: 'asc' }]
};

describe('buildDefaultAlertFilters', () => {
	it('leaves the query unfiltered for the "all" view', () => {
		expect(buildDefaultAlertFilters({ mode: 'all' })).toEqual(base);
	});

	it('excludes terminal statuses for the "open" view', () => {
		expect(buildDefaultAlertFilters({ mode: 'open' })).toEqual({ ...base, query: 'is:open' });
	});

	// `owner:me` rather than an id: the expression is stored per user and
	// resolved per request, so it stays correct if it is ever shared.
	it('scopes the open queue to the caller for "mine"', () => {
		expect(buildDefaultAlertFilters({ mode: 'mine' })).toEqual({
			...base,
			query: 'is:open owner:me'
		});
	});

	it('uses the unowned form for "unassigned"', () => {
		expect(buildDefaultAlertFilters({ mode: 'unassigned' })).toEqual({
			...base,
			query: 'is:open owner:none'
		});
	});

	it('pins an arbitrary expression for the "query" view', () => {
		expect(
			buildDefaultAlertFilters({ mode: 'query', query: 'severity:>=High -status:Closed' })
		).toEqual({ ...base, query: 'severity:>=High -status:Closed' });
	});

	it('falls back to the open queue when the pinned expression is blank', () => {
		expect(buildDefaultAlertFilters({ mode: 'query', query: '   ' })).toEqual({
			...base,
			query: 'is:open'
		});
	});

	it('applies a saved preset', () => {
		const filters = buildDefaultAlertFilters({ mode: 'preset', filter_id: 3 }, { preset });

		expect(filters.alert_severity_id).toBe(5);
		expect(filters.sort).toBe('asc');
	});

	it('falls back to an unfiltered view when the preset is gone', () => {
		expect(buildDefaultAlertFilters({ mode: 'preset', filter_id: 3 }, { preset: null })).toEqual(
			base
		);
	});
});

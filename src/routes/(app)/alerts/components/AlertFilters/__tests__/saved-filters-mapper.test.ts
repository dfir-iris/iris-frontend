import { describe, expect, it } from 'vitest';

import { savedFilterToUiFilters, uiFiltersToSavedFilterData } from '../saved-filters-mapper';
import { defaultFilters, type Filters } from '../filters';
import type { SavedFilter } from '$lib/services/alerts-filters.service';

/**
 * `filter_data` is free-form JSON server-side, so the only thing keeping
 * a preset honest is this mapper. The cases below are the two ways it can
 * lie: dropping something on the way out, and leaving something behind on
 * the way in.
 */

const preset = (data: unknown): SavedFilter =>
	({ filter_id: 1, filter_name: 'preset', filter_data: data }) as unknown as SavedFilter;

describe('uiFiltersToSavedFilterData', () => {
	it('carries the search expression into the preset', () => {
		const filters: Filters = { ...defaultFilters(), query: 'is:open owner:me' };

		expect(uiFiltersToSavedFilterData(filters).query).toBe('is:open owner:me');
	});

	it('leaves the expression undefined when the bar is empty', () => {
		expect(uiFiltersToSavedFilterData(defaultFilters()).query).toBeUndefined();
	});
});

describe('savedFilterToUiFilters', () => {
	it('restores the expression a preset was saved with', () => {
		const applied = savedFilterToUiFilters(preset({ query: 'severity:>=High' }), defaultFilters());

		expect(applied.query).toBe('severity:>=High');
	});

	it('clears the bar for a preset that carries no expression', () => {
		// Applying a preset replaces the view. Keeping the current query
		// would silently AND one analyst's typing onto another's saved
		// filter, and the result set would not match either.
		const applied = savedFilterToUiFilters(preset({ alert_source: 'crowdstrike' }), {
			...defaultFilters(),
			query: 'tag:phishing'
		});

		expect(applied.query).toBeUndefined();
	});

	it('leaves the filters untouched when the payload is unreadable', () => {
		const current: Filters = { ...defaultFilters(), query: 'tag:phishing' };

		expect(savedFilterToUiFilters(preset(null), current)).toEqual(current);
	});

	it('reads a payload saved as a single-element array', () => {
		// Older presets were stored wrapped in a list; both shapes are in
		// the database, so both have to load.
		const applied = savedFilterToUiFilters(preset([{ query: 'is:closed' }]), defaultFilters());

		expect(applied.query).toBe('is:closed');
	});
});

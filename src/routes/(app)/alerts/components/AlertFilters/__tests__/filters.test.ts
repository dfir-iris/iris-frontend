import { describe, it, expect } from 'vitest';
import { defaultFilters, isNarrowingFilter, type Filters } from '../filters';

/**
 * Regression: the alerts filter bar rendered an `event_time` chip on a
 * queue nobody had filtered.
 *
 * `Filters` carries the queue's sort state (`order_by` / `sort`) alongside
 * the real predicates because all of it round-trips through one URL query.
 * The chip builder skipped `sort` but not `order_by`, so it rendered that
 * key's *value* — `event_time`, straight out of `defaultFilters()` — as an
 * applied filter, complete with an × that dropped the sort column.
 *
 * Imported from `../filters` rather than the barrel so this stays a
 * plain-TypeScript test and doesn't pull the filter components in.
 */

describe('isNarrowingFilter', () => {
	it.each(['order_by', 'sort'] as (keyof Filters)[])('rejects the sort key %s', (key) => {
		expect(isNarrowingFilter(key)).toBe(false);
	});

	it.each([
		'alert_title',
		'alert_description',
		'alert_source',
		'alert_tags',
		'alert_status_id',
		'alert_severity_id',
		'alert_classification_id',
		'alert_customer_id',
		'alert_start_date',
		'alert_end_date',
		'creation_start_date',
		'creation_end_date',
		'alert_assets',
		'alert_iocs',
		'alert_ids',
		'source_reference',
		'case_id',
		'cluster_id',
		'alert_owner_id',
		'resolution_status_id',
		'custom_conditions',
		'query'
	] as (keyof Filters)[])('accepts the predicate key %s', (key) => {
		expect(isNarrowingFilter(key)).toBe(true);
	});
});

describe('defaultFilters', () => {
	it('narrows nothing — an untouched queue has no chips to show', () => {
		const shown = (Object.keys(defaultFilters()) as (keyof Filters)[]).filter(isNarrowingFilter);

		expect(shown).toEqual([]);
	});

	it('still carries the sort state the queue needs', () => {
		expect(defaultFilters()).toEqual({ order_by: 'event_time', sort: 'desc' });
	});
});

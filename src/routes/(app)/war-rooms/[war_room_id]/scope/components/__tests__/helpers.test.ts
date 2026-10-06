import { describe, expect, it } from 'vitest';
import {
	CASE_COLUMNS_MAX,
	filterCases,
	limitedList,
	missingCaseIds,
	pageCount,
	pageSlice,
	showCaseColumns
} from '../helpers';

describe('showCaseColumns()', () => {
	it('collapses the per-case columns past the cap', () => {
		expect(showCaseColumns(CASE_COLUMNS_MAX)).toBe(true);
		expect(showCaseColumns(CASE_COLUMNS_MAX + 1)).toBe(false);
	});
});

describe('pageCount() / pageSlice()', () => {
	it('counts at least one page', () => {
		expect(pageCount(0, 50)).toBe(1);
		expect(pageCount(50, 50)).toBe(1);
		expect(pageCount(51, 50)).toBe(2);
	});

	it('slices a 1-based page', () => {
		const items = Array.from({ length: 120 }, (_, i) => i);
		expect(pageSlice(items, 1, 50)).toEqual(items.slice(0, 50));
		expect(pageSlice(items, 3, 50)).toEqual(items.slice(100));
		expect(pageSlice(items, 9, 50)).toEqual(items.slice(100));
		expect(pageSlice(items, 0, 50)).toEqual(items.slice(0, 50));
	});
});

describe('limitedList()', () => {
	it('bounds long lists', () => {
		expect(limitedList(['a', 'b'])).toBe('a, b');
		expect(limitedList(['a', 'b', 'c', 'd'], 2)).toBe('a, b and 2 more');
	});
});

describe('missingCaseIds()', () => {
	it('keeps the order of the cases', () => {
		const cases = [3, 1, 2].map((id) => ({ case_id: id }));
		expect(missingCaseIds(new Set([1]), cases)).toEqual([3, 2]);
	});
});

describe('filterCases()', () => {
	const cases = [
		{ case_id: 12, case_name: 'Ransomware ACME', customer_name: 'Acme' },
		{ case_id: 7, case_name: 'Phishing', customer_name: 'Globex' }
	];

	it('matches id, name or customer', () => {
		expect(filterCases(cases, '')).toBe(cases);
		expect(filterCases(cases, '#12').map((c) => c.case_id)).toEqual([12]);
		expect(filterCases(cases, 'phish').map((c) => c.case_id)).toEqual([7]);
		expect(filterCases(cases, 'globex').map((c) => c.case_id)).toEqual([7]);
		expect(filterCases(cases, 'nothing')).toEqual([]);
	});
});

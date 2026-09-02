import { describe, it, expect } from 'vitest';
import { countActiveConditions, treeHasActiveCondition } from '../filters';
import type { FilterGroup } from '../filters';

const row = (value: string, operation = 'contains') =>
	({ fieldId: 'case_name', operation, value }) as FilterGroup['items'][number];

const group = (...items: FilterGroup['items']): FilterGroup => ({ logic: 'and', items });

describe('treeHasActiveCondition', () => {
	it('ignores rows that carry no value yet', () => {
		expect(treeHasActiveCondition(group(row('')))).toBe(false);
		expect(treeHasActiveCondition(group(row('   ')))).toBe(false);
		expect(treeHasActiveCondition(group(row('ransom')))).toBe(true);
	});

	it('counts valueless operators as active', () => {
		expect(treeHasActiveCondition(group(row('', 'empty')))).toBe(true);
		expect(treeHasActiveCondition(group(row('', 'not_empty')))).toBe(true);
	});

	it('looks inside nested groups', () => {
		expect(treeHasActiveCondition(group(group(row(''))))).toBe(false);
		expect(treeHasActiveCondition(group(group(row('dc-02'))))).toBe(true);
	});
});

describe('countActiveConditions', () => {
	// Drives the badge on the overview's Filters button, so a half-typed row
	// must not inflate the number the user sees.
	it('counts only rows that will narrow the query', () => {
		expect(countActiveConditions(group(row('a'), row(''), row('b')))).toBe(2);
	});

	it('is zero for an empty tree', () => {
		expect(countActiveConditions(group())).toBe(0);
	});

	it('includes valueless operators', () => {
		expect(countActiveConditions(group(row('', 'empty'), row('x')))).toBe(2);
	});

	it('sums nested groups', () => {
		expect(countActiveConditions(group(row('a'), group(row('b'), group(row('c'), row('')))))).toBe(
			3
		);
	});
});

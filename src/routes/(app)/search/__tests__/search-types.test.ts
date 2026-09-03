import { describe, expect, it } from 'vitest';
import type { SearchType } from '$lib/services/search.service';
import { toggleSearchType } from '../search-types';

const ALL: SearchType[] = [
	'summaries',
	'ioc',
	'assets',
	'events',
	'notes',
	'tasks',
	'evidences',
	'comments'
];

describe('toggleSearchType', () => {
	it('narrows to the clicked category when everything is selected', () => {
		expect(toggleSearchType(ALL, 'ioc', ALL)).toEqual(['ioc']);
	});

	it('does not negate the clicked category when everything is selected', () => {
		const next = toggleSearchType(ALL, 'ioc', ALL);

		expect(next).toContain('ioc');
		expect(next).toHaveLength(1);
	});

	it('adds a category once the selection is narrowed', () => {
		expect(toggleSearchType(['ioc'], 'assets', ALL)).toEqual(['ioc', 'assets']);
	});

	it('removes a category when more than one is selected', () => {
		expect(toggleSearchType(['ioc', 'assets', 'notes'], 'assets', ALL)).toEqual(['ioc', 'notes']);
	});

	it('returns added categories in catalog order regardless of click order', () => {
		const clickedOutOfOrder = toggleSearchType(['notes', 'ioc'], 'summaries', ALL);

		expect(clickedOutOfOrder).toEqual(['summaries', 'ioc', 'notes']);
	});

	it('falls back to every category when the last one is turned off', () => {
		expect(toggleSearchType(['ioc'], 'ioc', ALL)).toEqual(ALL);
	});

	it('adds to an empty selection, as left by the None button', () => {
		expect(toggleSearchType([], 'tasks', ALL)).toEqual(['tasks']);
	});

	it('re-narrows after the user selects every category by hand', () => {
		const everythingButOne = ALL.filter((t) => t !== 'comments');
		const backToAll = toggleSearchType(everythingButOne, 'comments', ALL);

		expect(backToAll).toEqual(ALL);
		expect(toggleSearchType(backToAll, 'events', ALL)).toEqual(['events']);
	});

	it('does not mutate the selection it is given', () => {
		const selected: SearchType[] = ['ioc', 'assets'];

		toggleSearchType(selected, 'notes', ALL);

		expect(selected).toEqual(['ioc', 'assets']);
	});

	it('never selects a type the catalog does not offer', () => {
		expect(toggleSearchType([], 'ioc', [])).toEqual([]);
		expect(toggleSearchType([], 'ioc', ['assets', 'notes'])).toEqual([]);
	});
});

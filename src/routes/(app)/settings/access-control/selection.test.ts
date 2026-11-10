import { describe, expect, it } from 'vitest';
import { selectionState, selectionToggleAll } from './selection';

describe('selectionState', () => {
	it('tells none, some and all apart', () => {
		expect(selectionState(new Set(), [1, 2])).toBe('none');
		expect(selectionState(new Set([1]), [1, 2])).toBe('some');
		expect(selectionState(new Set([1, 2, 3]), [1, 2])).toBe('all');
	});

	it('is none for an empty list', () => {
		expect(selectionState(new Set([1]), [])).toBe('none');
	});
});

describe('selectionToggleAll', () => {
	it('ticks every id when some are unticked', () => {
		expect([...selectionToggleAll(new Set([1]), [1, 2, 3])].sort()).toEqual([1, 2, 3]);
	});

	it('unticks them all when they are all ticked', () => {
		expect([...selectionToggleAll(new Set([1, 2]), [1, 2])]).toEqual([]);
	});

	it('keeps the ids filtered out of the list', () => {
		expect([...selectionToggleAll(new Set([9]), [1])].sort()).toEqual([1, 9]);
		expect([...selectionToggleAll(new Set([1, 9]), [1])]).toEqual([9]);
	});

	it('does not mutate the selection', () => {
		const selected = new Set([1]);
		selectionToggleAll(selected, [1, 2]);
		expect([...selected]).toEqual([1]);
	});
});

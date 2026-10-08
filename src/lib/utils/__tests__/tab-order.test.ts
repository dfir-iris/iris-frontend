import { describe, it, expect } from 'vitest';
import { applyTabOrder, isDefaultTabOrder, moveTab } from '../tab-order';

const TABS = [{ key: 'board' }, { key: 'chat' }, { key: 'scope' }, { key: 'tasks' }];
const keys = (tabs: { key: string }[]) => tabs.map((tab) => tab.key);

describe('applyTabOrder', () => {
	it('keeps the default order without a saved order', () => {
		expect(keys(applyTabOrder(TABS, undefined))).toEqual(['board', 'chat', 'scope', 'tasks']);
		expect(keys(applyTabOrder(TABS, []))).toEqual(['board', 'chat', 'scope', 'tasks']);
	});

	it('follows the saved order', () => {
		expect(keys(applyTabOrder(TABS, ['tasks', 'scope', 'chat', 'board']))).toEqual([
			'tasks',
			'scope',
			'chat',
			'board'
		]);
	});

	it('drops keys of tabs that no longer exist', () => {
		expect(keys(applyTabOrder(TABS, ['gone', 'chat', 'board', 'scope', 'tasks']))).toEqual([
			'chat',
			'board',
			'scope',
			'tasks'
		]);
	});

	it('appends tabs missing from the saved order in their default order', () => {
		expect(keys(applyTabOrder(TABS, ['scope', 'board']))).toEqual([
			'scope',
			'board',
			'chat',
			'tasks'
		]);
	});

	it('ignores a duplicated key', () => {
		expect(keys(applyTabOrder(TABS, ['chat', 'chat', 'board']))).toEqual([
			'chat',
			'board',
			'scope',
			'tasks'
		]);
	});
});

describe('moveTab', () => {
	it('moves a tab forward', () => {
		expect(moveTab(TABS, 0, 2)).toEqual(['chat', 'scope', 'board', 'tasks']);
	});

	it('moves a tab backward', () => {
		expect(moveTab(TABS, 3, 0)).toEqual(['tasks', 'board', 'chat', 'scope']);
	});

	it('leaves the order alone for an out-of-range move', () => {
		expect(moveTab(TABS, 0, -1)).toEqual(['board', 'chat', 'scope', 'tasks']);
		expect(moveTab(TABS, 3, 4)).toEqual(['board', 'chat', 'scope', 'tasks']);
	});
});

describe('isDefaultTabOrder', () => {
	it('is true without a saved order or with the default one', () => {
		expect(isDefaultTabOrder(TABS, undefined)).toBe(true);
		expect(isDefaultTabOrder(TABS, ['board', 'chat'])).toBe(true);
	});

	it('is false once a tab was moved', () => {
		expect(isDefaultTabOrder(TABS, ['chat', 'board'])).toBe(false);
	});
});

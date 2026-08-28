import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { activeViewStore } from '../active-view.store';

describe('activeViewStore', () => {
	beforeEach(() => {
		// Reset to default between tests
		activeViewStore.set('cases');
	});

	it('starts with the default value "cases"', () => {
		expect(get(activeViewStore)).toBe('cases');
	});

	it('updates when set() is called', () => {
		activeViewStore.set('alerts');
		expect(get(activeViewStore)).toBe('alerts');
	});

	it('updates when update() is called', () => {
		activeViewStore.update(() => 'war-rooms');
		expect(get(activeViewStore)).toBe('war-rooms');
	});

	it('notifies subscribers on change', () => {
		const observed: string[] = [];
		const unsub = activeViewStore.subscribe((v) => observed.push(v));
		activeViewStore.set('dashboards');
		activeViewStore.set('cases');
		unsub();
		expect(observed).toEqual(['cases', 'dashboards', 'cases']);
	});

	it('does not notify subscribers after unsubscribe', () => {
		const observed: string[] = [];
		const unsub = activeViewStore.subscribe((v) => observed.push(v));
		unsub();
		activeViewStore.set('alerts');
		// Only the initial emission should have been recorded
		expect(observed).toHaveLength(1);
		expect(observed[0]).toBe('cases');
	});
});

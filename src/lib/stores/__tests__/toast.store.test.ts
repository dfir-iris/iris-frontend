import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';

vi.mock('$app/environment', () => ({ browser: false }));

import { toasts, toast } from '../toast.store';

describe('toast store', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		// Reset store state between tests
		const current = get(toasts);
		current.forEach((t) => toasts.dismiss(t.id));
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it('starts empty', () => {
		expect(get(toasts)).toEqual([]);
	});

	it('adds a toast with a unique id', () => {
		const id = toasts.add({ title: 'Hello', variant: 'success' });
		const items = get(toasts);
		expect(items).toHaveLength(1);
		expect(items[0].id).toBe(id);
		expect(items[0].title).toBe('Hello');
		expect(items[0].variant).toBe('success');
	});

	it('toast() helper delegates to toasts.add', () => {
		const id = toast({ title: 'Test' });
		expect(typeof id).toBe('string');
		expect(get(toasts).find((t) => t.id === id)).toBeTruthy();
	});

	it('dismiss() removes the toast by id', () => {
		const id = toasts.add({ title: 'To dismiss' });
		expect(get(toasts)).toHaveLength(1);
		toasts.dismiss(id);
		expect(get(toasts)).toHaveLength(0);
	});

	it('auto-dismisses after the duration elapses', async () => {
		toasts.add({ title: 'Auto', duration: 3000 });
		expect(get(toasts)).toHaveLength(1);
		await vi.runAllTimersAsync();
		expect(get(toasts)).toHaveLength(0);
	});

	it('duration: 0 falls back to 5000ms default and auto-dismisses', async () => {
		// toast.duration || 5000 — the falsy `0` is treated as "use default"
		toasts.add({ title: 'Fallback', duration: 0 });
		expect(get(toasts)).toHaveLength(1);
		vi.advanceTimersByTime(4999);
		expect(get(toasts)).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(get(toasts)).toHaveLength(0);
	});

	it('accumulates multiple toasts', () => {
		toasts.add({ title: 'First' });
		toasts.add({ title: 'Second' });
		toasts.add({ title: 'Third' });
		expect(get(toasts)).toHaveLength(3);
	});

	it('dismissing one toast does not affect others', () => {
		const id1 = toasts.add({ title: 'Keep' });
		const id2 = toasts.add({ title: 'Remove' });
		toasts.dismiss(id2);
		const remaining = get(toasts);
		expect(remaining).toHaveLength(1);
		expect(remaining[0].id).toBe(id1);
	});

	it('dismissing a non-existent id is a no-op', () => {
		toasts.add({ title: 'Existing' });
		toasts.dismiss('nonexistent-id');
		expect(get(toasts)).toHaveLength(1);
	});

	it('each toast gets a distinct id', () => {
		const id1 = toasts.add({ title: 'A' });
		const id2 = toasts.add({ title: 'B' });
		expect(id1).not.toBe(id2);
	});

	it('default duration is 5000ms when duration is omitted — auto-dismiss at that boundary', async () => {
		toasts.add({ title: 'Default duration' }); // no duration field at all
		expect(get(toasts)).toHaveLength(1);
		vi.advanceTimersByTime(4999);
		expect(get(toasts)).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(get(toasts)).toHaveLength(0);
	});
});

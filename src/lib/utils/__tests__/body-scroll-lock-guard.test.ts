import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	bodyLockIsStale,
	releaseStaleBodyLock,
	watchBodyScrollLock
} from '../body-scroll-lock-guard';

const LOCKED = 'pointer-events: none; overflow: hidden; padding-right: 15px;';

function openLayer(attrs: Record<string, string>): HTMLElement {
	const el = document.createElement('div');
	for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
	document.body.appendChild(el);
	return el;
}

afterEach(() => {
	document.body.innerHTML = '';
	document.body.removeAttribute('style');
	vi.useRealTimers();
});

describe('bodyLockIsStale', () => {
	it('is false on an unlocked body', () => {
		expect(bodyLockIsStale()).toBe(false);
	});

	it('is false while a dialog is open', () => {
		document.body.setAttribute('style', LOCKED);
		openLayer({ role: 'dialog', 'data-state': 'open' });
		expect(bodyLockIsStale()).toBe(false);
	});

	it('is false while a select is open', () => {
		document.body.setAttribute('style', LOCKED);
		openLayer({ 'data-select-content': '', 'data-state': 'open' });
		expect(bodyLockIsStale()).toBe(false);
	});

	it('is true when the only dialog left is closed', () => {
		document.body.setAttribute('style', LOCKED);
		openLayer({ role: 'dialog', 'data-state': 'closed' });
		expect(bodyLockIsStale()).toBe(true);
	});
});

describe('releaseStaleBodyLock', () => {
	it('drops the lock and keeps the other properties', () => {
		document.body.setAttribute('style', `${LOCKED} color: red;`);
		expect(releaseStaleBodyLock()).toBe(true);
		expect(document.body.getAttribute('style')).toBe('color: red;');
	});

	it('removes the emptied style attribute', () => {
		document.body.setAttribute('style', LOCKED);
		releaseStaleBodyLock();
		expect(document.body.hasAttribute('style')).toBe(false);
	});

	it('leaves the lock of an open layer alone', () => {
		document.body.setAttribute('style', LOCKED);
		openLayer({ role: 'menu', 'data-state': 'open' });
		expect(releaseStaleBodyLock()).toBe(false);
		expect(document.body.style.pointerEvents).toBe('none');
	});
});

describe('watchBodyScrollLock', () => {
	it('releases a lock restored after the last layer closed', async () => {
		vi.useFakeTimers();
		const stop = watchBodyScrollLock();
		document.body.setAttribute('style', LOCKED);
		await Promise.resolve(); // MutationObserver callbacks are microtasks
		vi.advanceTimersByTime(200);
		expect(document.body.hasAttribute('style')).toBe(false);
		stop();
	});

	it('keeps the lock of an open dialog', async () => {
		vi.useFakeTimers();
		const stop = watchBodyScrollLock();
		openLayer({ role: 'dialog', 'data-state': 'open' });
		document.body.setAttribute('style', LOCKED);
		await Promise.resolve();
		vi.advanceTimersByTime(200);
		expect(document.body.style.pointerEvents).toBe('none');
		stop();
	});
});

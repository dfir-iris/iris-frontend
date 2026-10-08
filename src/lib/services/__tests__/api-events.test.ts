import { describe, expect, it, vi } from 'vitest';
import { apiEventPath, emitApiEvent, hasApiEventListeners, onApiEvent } from '../api-events';

const event = { method: 'POST', path: '/cases', status: 201, ok: true, data: {} };

describe('api-events', () => {
	it('delivers events to listeners until they unsubscribe', () => {
		const listener = vi.fn();
		const off = onApiEvent(listener);
		expect(hasApiEventListeners()).toBe(true);

		emitApiEvent(event);
		off();
		emitApiEvent(event);

		expect(listener).toHaveBeenCalledTimes(1);
		expect(listener).toHaveBeenCalledWith(event);
		expect(hasApiEventListeners()).toBe(false);
	});

	it('isolates a throwing listener', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const after = vi.fn();
		const offBad = onApiEvent(() => {
			throw new Error('boom');
		});
		const offGood = onApiEvent(after);

		expect(() => emitApiEvent(event)).not.toThrow();
		expect(after).toHaveBeenCalledTimes(1);

		offBad();
		offGood();
		error.mockRestore();
	});
});

describe('apiEventPath', () => {
	it('strips origin, query, the /api/v2 prefix and trailing slashes', () => {
		expect(apiEventPath('https://iris.local/api/v2/cases/12/assets/?page=2')).toBe(
			'/cases/12/assets'
		);
		expect(apiEventPath('/api/v2/war-rooms')).toBe('/war-rooms');
		expect(apiEventPath('/api/v2')).toBe('/');
		expect(apiEventPath('/manage/vulnerabilities')).toBe('/manage/vulnerabilities');
	});
});

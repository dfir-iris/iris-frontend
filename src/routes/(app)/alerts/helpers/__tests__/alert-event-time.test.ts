import { describe, expect, it } from 'vitest';
import { alertEventTimeForApi } from '../alert-event-time';

describe('alertEventTimeForApi', () => {
	it('omits the value when the field is left empty', () => {
		expect(alertEventTimeForApi('')).toBeUndefined();
	});

	it('omits the value when it cannot be parsed', () => {
		expect(alertEventTimeForApi('not-a-date')).toBeUndefined();
	});

	it('emits no timezone suffix, so a naive column gets a naive value', () => {
		const result = alertEventTimeForApi('2026-09-03T14:30');

		expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
		expect(result).not.toMatch(/[Zz]|[+-]\d{2}:\d{2}$/);
	});

	it('preserves the instant the user picked, in UTC', () => {
		const local = '2026-09-03T14:30';
		const expected = new Date(local).toISOString().slice(0, 19);

		expect(alertEventTimeForApi(local)).toBe(expected);
	});

	it('drops sub-second precision rather than sending milliseconds', () => {
		expect(alertEventTimeForApi('2026-09-03T14:30:45.123')).toBe(
			new Date('2026-09-03T14:30:45.123').toISOString().slice(0, 19)
		);
	});

	it('round-trips back to the same instant', () => {
		const local = '2026-01-15T08:05';
		const sent = alertEventTimeForApi(local) as string;

		// The server reads it as UTC, which is how it was written.
		expect(new Date(`${sent}Z`).getTime()).toBe(new Date(local).getTime());
	});
});

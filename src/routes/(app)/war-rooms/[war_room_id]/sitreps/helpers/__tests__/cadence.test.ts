import { describe, it, expect } from 'vitest';
import {
	cadenceSelectValue,
	describeDue,
	formatCadence,
	formatDurationShort,
	reminderOptions,
	validateCadenceMinutes
} from '../cadence';

describe('cadenceSelectValue()', () => {
	it('maps null to none, presets to their value and the rest to custom', () => {
		expect(cadenceSelectValue(null)).toBe('none');
		expect(cadenceSelectValue(undefined)).toBe('none');
		expect(cadenceSelectValue(240)).toBe('240');
		expect(cadenceSelectValue(90)).toBe('custom');
	});
});

describe('validateCadenceMinutes()', () => {
	it('enforces the 15..10080 integer range', () => {
		expect(validateCadenceMinutes(15)).toBeNull();
		expect(validateCadenceMinutes(10080)).toBeNull();
		expect(validateCadenceMinutes(14)).not.toBeNull();
		expect(validateCadenceMinutes(10081)).not.toBeNull();
		expect(validateCadenceMinutes(30.5)).not.toBeNull();
		expect(validateCadenceMinutes(Number.NaN)).not.toBeNull();
	});
});

describe('reminderOptions()', () => {
	it('only offers reminders not longer than the cadence', () => {
		expect(reminderOptions(null)).toEqual([]);
		expect(reminderOptions(30)).toEqual([5, 15, 30]);
		expect(reminderOptions(1440)).toEqual([5, 15, 30, 60, 120]);
	});
});

describe('formatDurationShort()', () => {
	it('formats minutes, hours and days', () => {
		expect(formatDurationShort(45 * 60000)).toBe('45 min');
		expect(formatDurationShort(3 * 3600000)).toBe('3 h');
		expect(formatDurationShort(135 * 60000)).toBe('2 h 15 min');
		expect(formatDurationShort((2 * 24 + 4) * 3600000)).toBe('2 d 4 h');
		expect(formatDurationShort(-90 * 60000)).toBe('1 h 30 min');
	});
});

describe('formatCadence()', () => {
	it('uses preset labels or a computed one', () => {
		expect(formatCadence(240)).toBe('Every 4 h');
		expect(formatCadence(90)).toBe('Every 1 h 30 min');
	});
});

describe('describeDue()', () => {
	const now = Date.UTC(2026, 9, 6, 12, 0, 0);

	it('returns null without a due date', () => {
		expect(describeDue(null, now)).toBeNull();
		expect(describeDue('', now)).toBeNull();
	});

	it('treats naive server datetimes as UTC', () => {
		expect(describeDue('2026-10-06T14:00:00', now)).toEqual({
			overdue: false,
			label: 'Next SitRep due in 2 h'
		});
	});

	it('flags overdue', () => {
		expect(describeDue('2026-10-06T11:30:00', now)).toEqual({
			overdue: true,
			label: 'Overdue by 30 min'
		});
	});
});

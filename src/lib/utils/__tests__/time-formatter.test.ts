import { describe, it, expect, afterEach } from 'vitest';
import {
	calendarDaysBetween,
	dayKey,
	formatDate,
	formatDateTime,
	formatDayHeading,
	formatTime,
	fromDateInputValue,
	fromDateTimeInputValue,
	mediumDateTimeFormatter,
	parseServerDate,
	timeZoneLabel,
	toDateTimeInputValue,
	zonedDateTime
} from '../time-formatter';
import { timezone, TIMEZONE_BROWSER, browserTimeZone } from '$lib/stores/timezone.store.svelte';
import {
	timeFormat,
	TIME_FORMAT_12H,
	TIME_FORMAT_24H,
	TIME_FORMAT_LOCALE
} from '$lib/stores/time-format.store.svelte';

// 2024-06-15T12:30:00.000Z
const ISO_TIMESTAMP = '2024-06-15T12:30:00.000Z';
const EPOCH_MS = new Date(ISO_TIMESTAMP).getTime();

afterEach(() => {
	timezone.set(TIMEZONE_BROWSER);
	timeFormat.set(TIME_FORMAT_24H);
});

// ── timezone store ────────────────────────────────────────────────────────────

describe('timezone store', () => {
	it('defaults to the browser zone', () => {
		expect(timezone.preference).toBe(TIMEZONE_BROWSER);
		expect(timezone.zone).toBe(browserTimeZone());
	});

	it('resolves an IANA preference to itself', () => {
		timezone.set('Asia/Tokyo');
		expect(timezone.preference).toBe('Asia/Tokyo');
		expect(timezone.zone).toBe('Asia/Tokyo');
	});

	it('falls back to the browser zone on unknown or empty values', () => {
		timezone.set('Mars/Olympus_Mons');
		expect(timezone.preference).toBe(TIMEZONE_BROWSER);
		timezone.set('UTC');
		timezone.set(null);
		expect(timezone.preference).toBe(TIMEZONE_BROWSER);
	});
});

// ── parseServerDate ───────────────────────────────────────────────────────────

describe('parseServerDate', () => {
	it('reads offset-less backend date-times as UTC, not browser-local', () => {
		expect(parseServerDate('2024-06-15T12:30:00')?.toISOString()).toBe(ISO_TIMESTAMP);
		expect(parseServerDate('2024-06-15T12:30')?.toISOString()).toBe(ISO_TIMESTAMP);
		expect(parseServerDate('2024-06-15 12:30:00.000000')?.toISOString()).toBe(ISO_TIMESTAMP);
		expect(parseServerDate('2024-06-15T12:30:00.123456')?.getTime()).toBe(EPOCH_MS + 123);
	});

	it('keeps explicit offsets', () => {
		expect(parseServerDate(ISO_TIMESTAMP)?.getTime()).toBe(EPOCH_MS);
		expect(parseServerDate('2024-06-15T14:30:00+02:00')?.getTime()).toBe(EPOCH_MS);
		expect(parseServerDate('Sat, 15 Jun 2024 12:30:00 GMT')?.getTime()).toBe(EPOCH_MS);
	});

	it('accepts epochs and Dates', () => {
		expect(parseServerDate(EPOCH_MS)?.getTime()).toBe(EPOCH_MS);
		expect(parseServerDate(new Date(EPOCH_MS))?.getTime()).toBe(EPOCH_MS);
	});

	it('returns null on empty or unparseable input', () => {
		expect(parseServerDate(null)).toBeNull();
		expect(parseServerDate(undefined)).toBeNull();
		expect(parseServerDate('')).toBeNull();
		expect(parseServerDate('not a date')).toBeNull();
		expect(parseServerDate(Number.NaN)).toBeNull();
	});
});

// ── formatting ────────────────────────────────────────────────────────────────

describe('formatting follows the display timezone', () => {
	it('renders the same instant differently per zone', () => {
		timezone.set('UTC');
		expect(
			formatTime(ISO_TIMESTAMP, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
		).toBe('12:30');
		timezone.set('Asia/Tokyo');
		expect(
			formatTime(ISO_TIMESTAMP, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
		).toBe('21:30');
	});

	it('treats an offset-less backend value as UTC when formatting', () => {
		timezone.set('America/New_York');
		expect(
			formatTime('2024-06-15T12:30:00', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
		).toBe('08:30');
	});

	it('crosses the day boundary with the zone', () => {
		timezone.set('Asia/Tokyo');
		expect(formatDate('2024-06-15T20:00:00Z', { day: 'numeric' })).toBe('16');
		timezone.set('UTC');
		expect(formatDate('2024-06-15T20:00:00Z', { day: 'numeric' })).toBe('15');
	});

	it('never shifts a bare calendar date', () => {
		timezone.set('America/Los_Angeles');
		expect(formatDate('2024-06-15', { day: 'numeric' })).toBe('15');
	});

	it('returns an empty string on bad input', () => {
		expect(formatDateTime(null)).toBe('');
		expect(formatDate('garbage')).toBe('');
		expect(mediumDateTimeFormatter(undefined)).toBe('');
	});

	it('mediumDateTimeFormatter accepts strings, epochs and Dates alike', () => {
		timezone.set('UTC');
		const a = mediumDateTimeFormatter(ISO_TIMESTAMP);
		expect(a).toContain('2024');
		expect(mediumDateTimeFormatter(EPOCH_MS)).toBe(a);
		expect(mediumDateTimeFormatter(new Date(EPOCH_MS))).toBe(a);
	});

	it('labels the zone', () => {
		timezone.set('UTC');
		expect(timeZoneLabel()).toBe('UTC');
	});
});

// ── calendar helpers ──────────────────────────────────────────────────────────

describe('calendar helpers', () => {
	it('zonedDateTime exposes wall-clock fields in the display zone', () => {
		timezone.set('Asia/Tokyo');
		const z = zonedDateTime(ISO_TIMESTAMP);
		expect([z?.year, z?.month, z?.day, z?.hour, z?.minute]).toEqual([2024, 6, 15, 21, 30]);
	});

	it('dayKey is the display-zone day', () => {
		timezone.set('Asia/Tokyo');
		expect(dayKey('2024-06-15T20:00:00Z')).toBe('2024-06-16');
		timezone.set('UTC');
		expect(dayKey('2024-06-15T20:00:00Z')).toBe('2024-06-15');
		expect(dayKey(null)).toBe('');
	});

	it('calendarDaysBetween counts calendar days, not 24h periods', () => {
		timezone.set('UTC');
		expect(calendarDaysBetween('2024-06-15T23:59:00Z', '2024-06-16T00:01:00Z')).toBe(1);
		expect(calendarDaysBetween('2024-06-15T00:01:00Z', '2024-06-15T23:59:00Z')).toBe(0);
		expect(calendarDaysBetween('2024-06-10T12:00:00Z', '2024-06-15T12:00:00Z')).toBe(5);
		timezone.set('Asia/Tokyo');
		// 16:00Z is already the next day in Tokyo.
		expect(calendarDaysBetween('2024-06-15T14:00:00Z', '2024-06-15T16:00:00Z')).toBe(1);
	});
});

// ── form inputs ───────────────────────────────────────────────────────────────

describe('datetime-local round trip', () => {
	it('writes the display-zone wall clock', () => {
		timezone.set('Asia/Tokyo');
		expect(toDateTimeInputValue(ISO_TIMESTAMP)).toBe('2024-06-15T21:30');
		expect(toDateTimeInputValue(ISO_TIMESTAMP, true)).toBe('2024-06-15T21:30:00');
		expect(toDateTimeInputValue(null)).toBe('');
	});

	it('reads the wall clock back in the display zone', () => {
		timezone.set('Asia/Tokyo');
		expect(fromDateTimeInputValue('2024-06-15T21:30')?.toISOString()).toBe(ISO_TIMESTAMP);
		timezone.set('UTC');
		expect(fromDateTimeInputValue('2024-06-15T12:30')?.toISOString()).toBe(ISO_TIMESTAMP);
	});

	it('round-trips', () => {
		timezone.set('America/New_York');
		expect(fromDateTimeInputValue(toDateTimeInputValue(ISO_TIMESTAMP))?.toISOString()).toBe(
			ISO_TIMESTAMP
		);
	});

	it('returns null on empty or bad input', () => {
		expect(fromDateTimeInputValue('')).toBeNull();
		expect(fromDateTimeInputValue('nope')).toBeNull();
		expect(fromDateInputValue('')).toBeNull();
	});

	it('date inputs start at display-zone midnight', () => {
		timezone.set('Asia/Tokyo');
		expect(fromDateInputValue('2024-06-15')?.toISOString()).toBe('2024-06-14T15:00:00.000Z');
	});
});

describe('formatDayHeading', () => {
	it('labels today and yesterday in the display zone', () => {
		timezone.set('UTC');
		const today = dayKey(Date.now());
		expect(formatDayHeading(today)).toMatch(/^Today · /);
		expect(formatDayHeading(dayKey(Date.now() - 86_400_000))).toMatch(/^Yesterday · /);
	});

	it('appends the year outside the current one', () => {
		expect(formatDayHeading('2001-06-15')).toMatch(/, 2001$/);
	});

	it('returns unparseable keys as-is', () => {
		expect(formatDayHeading('')).toBe('');
		expect(formatDayHeading('nope')).toBe('nope');
	});
});

describe('clock format preference', () => {
	const HM: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };

	it('defaults to 24h', () => {
		timezone.set('UTC');
		expect(timeFormat.preference).toBe(TIME_FORMAT_24H);
		expect(formatTime('2024-06-15T14:48:00Z', HM)).toBe('14:48');
	});

	it('switches every formatter to 12h', () => {
		timezone.set('UTC');
		timeFormat.set(TIME_FORMAT_12H);
		expect(formatTime('2024-06-15T14:48:00Z', HM)).toMatch(/^02:48\s?PM$/i);
		expect(mediumDateTimeFormatter('2024-06-15T14:48:00Z')).toMatch(/2:48\s?PM/i);
	});

	it('overrides a caller asking for the other clock', () => {
		timezone.set('UTC');
		expect(formatTime('2024-06-15T14:48:00Z', { ...HM, hour12: true })).toBe('14:48');
		timeFormat.set(TIME_FORMAT_12H);
		expect(formatTime('2024-06-15T14:48:00Z', { ...HM, hourCycle: 'h23' })).toMatch(/PM/i);
	});

	it('leaves the choice to the locale when asked to', () => {
		timeFormat.set(TIME_FORMAT_LOCALE);
		expect(timeFormat.hourCycle).toBeUndefined();
	});

	it('falls back to 24h on unknown values', () => {
		timeFormat.set(TIME_FORMAT_12H);
		timeFormat.set('13h');
		expect(timeFormat.preference).toBe(TIME_FORMAT_24H);
	});

	it('does not touch date-only formats', () => {
		timeFormat.set(TIME_FORMAT_12H);
		expect(formatDate('2024-06-15', { day: 'numeric' })).toBe('15');
	});
});

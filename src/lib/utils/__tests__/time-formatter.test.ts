import { describe, it, expect } from 'vitest';
import { TimeFormatter, mediumDateTimeFormatter } from '../time-formatter';

// A fixed UTC timestamp used throughout so tests are time-zone-independent.
// 2024-06-15T12:30:00.000Z
const ISO_TIMESTAMP = '2024-06-15T12:30:00.000Z';
const EPOCH_MS = new Date(ISO_TIMESTAMP).getTime(); // 1718454600000

// ── TimeFormatter.format ───────────────────────────────────────────────────────

describe('TimeFormatter.format', () => {
	it('returns a non-empty string for a valid ISO timestamp', () => {
		const result = TimeFormatter.format(ISO_TIMESTAMP);
		expect(typeof result).toBe('string');
		expect(result.length).toBeGreaterThan(0);
	});

	it('defaults to UTC timezone so the output includes the UTC wall-clock time', () => {
		// In UTC, 12:30 should appear in the formatted string regardless of
		// the host machine's local timezone.
		const result = TimeFormatter.format(ISO_TIMESTAMP);
		expect(result).toContain('12:30');
	});

	it('renders a different time when a non-UTC timezone is supplied', () => {
		const utc = TimeFormatter.format(ISO_TIMESTAMP, { timezone: 'UTC' });
		const ny = TimeFormatter.format(ISO_TIMESTAMP, { timezone: 'America/New_York' });
		// New York is UTC-4 in summer, so the hour must differ
		expect(utc).not.toBe(ny);
	});

	it('uses the en-US locale by default', () => {
		const result = TimeFormatter.format(ISO_TIMESTAMP);
		// en-US medium date format includes the month abbreviation
		expect(result).toMatch(/Jun/);
	});

	it('accepts a custom locale and produces locale-appropriate output', () => {
		const fr = TimeFormatter.format(ISO_TIMESTAMP, { locale: 'fr-FR' });
		// French medium date includes "juin" (June in French)
		expect(fr.toLowerCase()).toContain('juin');
	});

	it('accepts short format and produces a shorter string than medium', () => {
		const short = TimeFormatter.format(ISO_TIMESTAMP, { format: 'short' });
		const medium = TimeFormatter.format(ISO_TIMESTAMP, { format: 'medium' });
		// Short omits seconds and uses abbreviated month; medium is typically longer
		expect(short.length).toBeLessThanOrEqual(medium.length);
	});

	it('accepts long format and produces a longer or equal string than medium', () => {
		const long = TimeFormatter.format(ISO_TIMESTAMP, { format: 'long' });
		const medium = TimeFormatter.format(ISO_TIMESTAMP, { format: 'medium' });
		expect(long.length).toBeGreaterThanOrEqual(medium.length);
	});

	it('partial config merges with defaults — supplying only timezone keeps en-US locale', () => {
		const result = TimeFormatter.format(ISO_TIMESTAMP, { timezone: 'UTC' });
		expect(result).toMatch(/Jun/);
	});

	it('formats the year correctly', () => {
		const result = TimeFormatter.format(ISO_TIMESTAMP);
		expect(result).toContain('2024');
	});

	it('produces consistent output for the same inputs (deterministic)', () => {
		const a = TimeFormatter.format(ISO_TIMESTAMP);
		const b = TimeFormatter.format(ISO_TIMESTAMP);
		expect(a).toBe(b);
	});
});

// ── mediumDateTimeFormatter ───────────────────────────────────────────────────

describe('mediumDateTimeFormatter', () => {
	it('returns a non-empty string for a Date object', () => {
		const result = mediumDateTimeFormatter(new Date(ISO_TIMESTAMP));
		expect(typeof result).toBe('string');
		expect(result.length).toBeGreaterThan(0);
	});

	it('returns a non-empty string for a millisecond epoch number', () => {
		const result = mediumDateTimeFormatter(EPOCH_MS);
		expect(typeof result).toBe('string');
		expect(result.length).toBeGreaterThan(0);
	});

	it('produces identical output for a Date and its numeric epoch value', () => {
		const fromDate = mediumDateTimeFormatter(new Date(EPOCH_MS));
		const fromNumber = mediumDateTimeFormatter(EPOCH_MS);
		expect(fromDate).toBe(fromNumber);
	});

	it('formats the correct year', () => {
		const result = mediumDateTimeFormatter(new Date(ISO_TIMESTAMP));
		expect(result).toContain('2024');
	});

	it('produces consistent output on repeated calls (deterministic)', () => {
		const a = mediumDateTimeFormatter(EPOCH_MS);
		const b = mediumDateTimeFormatter(EPOCH_MS);
		expect(a).toBe(b);
	});

	it('produces a different result for a different date', () => {
		const jan = mediumDateTimeFormatter(new Date('2024-01-01T00:00:00.000Z'));
		const jun = mediumDateTimeFormatter(new Date(ISO_TIMESTAMP));
		expect(jan).not.toBe(jun);
	});
});

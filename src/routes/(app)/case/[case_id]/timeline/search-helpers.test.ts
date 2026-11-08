import { describe, expect, it } from 'vitest';
import {
	ALL_TIME,
	bucketsRange,
	customRangeMode,
	customTimeRange,
	decodeDraggedEvents,
	draggedEventIds,
	encodeDraggedEvents,
	eventTags,
	fieldClause,
	formatInterval,
	resolveTimeRange,
	timeRangeLabel
} from './search-helpers';

describe('resolveTimeRange', () => {
	const now = new Date('2026-05-10T12:00:00Z');

	it('leaves all time unbounded', () => {
		expect(resolveTimeRange(ALL_TIME, now)).toEqual({ start: null, end: null });
	});

	it('resolves a preset against the clock, open-ended', () => {
		expect(resolveTimeRange({ kind: 'preset', preset: '24h' }, now)).toEqual({
			start: '2026-05-09T12:00:00.000Z',
			end: null
		});
	});

	it('passes a custom window through', () => {
		const range = { kind: 'custom' as const, start: 'a', end: 'b' };
		expect(resolveTimeRange(range, now)).toEqual({ start: 'a', end: 'b' });
	});

	it('leaves the open side of a custom range unbounded', () => {
		expect(resolveTimeRange({ kind: 'custom', start: null, end: 'b' }, now)).toEqual({
			start: null,
			end: 'b'
		});
	});
});

describe('customTimeRange', () => {
	const a = new Date('2026-01-01T00:00:00Z');
	const b = new Date('2026-01-02T00:00:00Z');

	it('builds each mode', () => {
		expect(customTimeRange('between', a, b)).toEqual({
			kind: 'custom',
			start: a.toISOString(),
			end: b.toISOString()
		});
		expect(customTimeRange('before', null, b)).toEqual({
			kind: 'custom',
			start: null,
			end: b.toISOString()
		});
		expect(customTimeRange('after', a, null)).toEqual({
			kind: 'custom',
			start: a.toISOString(),
			end: null
		});
	});

	it('refuses a missing or inverted date', () => {
		expect(customTimeRange('between', a, null)).toHaveProperty('error');
		expect(customTimeRange('between', b, a)).toHaveProperty('error');
		expect(customTimeRange('between', a, a)).toHaveProperty('error');
		expect(customTimeRange('before', a, null)).toHaveProperty('error');
		expect(customTimeRange('after', null, b)).toHaveProperty('error');
	});

	it('reads the mode back from a range', () => {
		expect(customRangeMode({ kind: 'custom', start: 'a', end: 'b' })).toBe('between');
		expect(customRangeMode({ kind: 'custom', start: null, end: 'b' })).toBe('before');
		expect(customRangeMode({ kind: 'custom', start: 'a', end: null })).toBe('after');
		expect(customRangeMode(ALL_TIME)).toBe('between');
	});
});

describe('timeRangeLabel', () => {
	const format = (iso: string) => iso.slice(0, 10);

	it('labels presets, windows and open ranges', () => {
		expect(timeRangeLabel(ALL_TIME, format)).toBeNull();
		expect(timeRangeLabel({ kind: 'preset', preset: '7d' }, format)).toBe('Last 7 days');
		expect(
			timeRangeLabel({ kind: 'custom', start: '2026-01-01T00', end: '2026-01-02T00' }, format)
		).toBe('2026-01-01 → 2026-01-02');
		expect(timeRangeLabel({ kind: 'custom', start: null, end: '2026-01-02T00' }, format)).toBe(
			'Before 2026-01-02'
		);
		expect(timeRangeLabel({ kind: 'custom', start: '2026-01-01T00', end: null }, format)).toBe(
			'After 2026-01-01'
		);
	});
});

describe('formatInterval', () => {
	it('uses the largest unit dividing evenly', () => {
		expect(formatInterval(1)).toBe('1 second');
		expect(formatInterval(30)).toBe('30 seconds');
		expect(formatInterval(1800)).toBe('30 minutes');
		expect(formatInterval(3600)).toBe('1 hour');
		expect(formatInterval(43200)).toBe('12 hours');
		expect(formatInterval(7 * 86400)).toBe('7 days');
	});
});

describe('bucketsRange', () => {
	const buckets = [
		{ start: '2026-01-01T00:00:00.000000' },
		{ start: '2026-01-01T01:00:00.000000' },
		{ start: '2026-01-01T02:00:00.000000' }
	];

	it('spans from the first bucket start to the end of the last', () => {
		expect(bucketsRange(buckets, 3600, 0, 1)).toEqual({
			start: '2026-01-01T00:00:00.000Z',
			end: '2026-01-01T02:00:00.000Z'
		});
	});

	it('accepts a right-to-left drag and clamps out-of-range indexes', () => {
		expect(bucketsRange(buckets, 3600, 9, 2)).toEqual({
			start: '2026-01-01T02:00:00.000Z',
			end: '2026-01-01T03:00:00.000Z'
		});
	});

	it('has nothing to zoom on without buckets', () => {
		expect(bucketsRange([], 3600, 0, 0)).toBeNull();
	});
});

describe('fieldClause', () => {
	it('writes a bare term when it can', () => {
		expect(fieldClause('asset', 'DC01')).toBe('asset:DC01');
	});

	it('quotes values the grammar would split', () => {
		expect(fieldClause('timeline', 'Initial access')).toBe('timeline:"Initial access"');
		expect(fieldClause('ioc', 'http://x')).toBe('ioc:"http://x"');
	});

	it('negates an exclusion', () => {
		expect(fieldClause('source', 'sysmon', true)).toBe('-source:sysmon');
	});
});

describe('eventTags', () => {
	it('splits, trims and drops empty tags', () => {
		expect(eventTags({ event_tags: ' a, b ,,c' })).toEqual(['a', 'b', 'c']);
		expect(eventTags({})).toEqual([]);
	});
});

describe('drag payload', () => {
	it('round-trips event ids', () => {
		expect(decodeDraggedEvents(encodeDraggedEvents([3, 1]))).toEqual([3, 1]);
	});

	it('ignores foreign payloads', () => {
		expect(decodeDraggedEvents('not json')).toEqual([]);
		expect(decodeDraggedEvents('{"a":1}')).toEqual([]);
		expect(decodeDraggedEvents('[1,"2",-3,4.5,5]')).toEqual([1, 5]);
	});

	it('drags the selection when the row is part of it, the row alone otherwise', () => {
		const selected = new Set([1, 2]);
		expect(draggedEventIds(2, selected)).toEqual([1, 2]);
		expect(draggedEventIds(7, selected)).toEqual([7]);
	});
});

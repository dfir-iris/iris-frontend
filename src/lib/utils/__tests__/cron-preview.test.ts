import { describe, it, expect } from 'vitest';
import { cronPreview, describeCron, nextCronRuns, parseCron } from '../cron-preview';

describe('describeCron', () => {
	it.each([
		['* * * * *', 'Every minute'],
		['*/3 * * * *', 'Every 3 minutes'],
		['0 * * * *', 'At minute 0 of every hour'],
		['15,45 * * * *', 'At minutes 15 and 45 of every hour'],
		['30 9 * * *', 'At 09:30'],
		['0 9,17 * * *', 'At 09:00 and 17:00'],
		['0 9 * * 1-5', 'At 09:00, on Monday through Friday'],
		['0 9 * * mon,wed', 'At 09:00, on Monday and Wednesday'],
		['0 0 1 * *', 'At 00:00, on day 1 of the month'],
		['0 0 1 jan *', 'At 00:00, on day 1 of the month, in January'],
		['0 8 * * 0', 'At 08:00, on Sunday'],
		['0 8 * * 7', 'At 08:00, on Sunday'],
		['@hourly', 'At minute 0 of every hour'],
		['@daily', 'At 00:00'],
		['0 */2 * * *', 'At minute 0, every 2 hours'],
		['*/10 9-17 * * *', 'Every 10 minutes during hour 9-17']
	])('%s → %s', (expr, text) => {
		expect(describeCron(expr)).toBe(text);
	});
});

describe('parseCron errors', () => {
	it.each([
		['', 'Empty cron expression'],
		['* * * *', 'Expected 5 fields'],
		['60 * * * *', 'out of range'],
		['* 24 * * *', 'out of range'],
		['*/0 * * * *', 'step'],
		['a * * * *', 'Invalid minute value'],
		['5-1 * * * *', 'Invalid minute range'],
		['1,,2 * * * *', 'Empty minute']
	])('%s', (expr, message) => {
		expect(() => parseCron(expr)).toThrow(message);
	});
});

describe('nextCronRuns', () => {
	const from = new Date(Date.UTC(2026, 0, 5, 10, 7, 30)); // Monday 5 Jan 2026 10:07:30 UTC

	it('steps every 3 minutes', () => {
		const next = nextCronRuns('*/3 * * * *', from, 3);
		expect(next.map((d) => d.getUTCMinutes())).toEqual([9, 12, 15]);
	});

	it('jumps to the next weekday slot', () => {
		const next = nextCronRuns('0 9 * * 1-5', from, 2);
		expect(next[0]).toEqual(new Date(Date.UTC(2026, 0, 6, 9, 0)));
		expect(next[1]).toEqual(new Date(Date.UTC(2026, 0, 7, 9, 0)));
	});

	it('ORs day-of-month and day-of-week when both are set', () => {
		// 1st of the month or any Sunday.
		const next = nextCronRuns('0 0 1 * 0', from, 3);
		expect(next).toEqual([
			new Date(Date.UTC(2026, 0, 11, 0, 0)),
			new Date(Date.UTC(2026, 0, 18, 0, 0)),
			new Date(Date.UTC(2026, 0, 25, 0, 0))
		]);
	});

	it('yields nothing for an impossible date', () => {
		expect(nextCronRuns('0 0 31 2 *', from, 1)).toEqual([]);
	});
});

describe('nextCronRuns (UTC)', () => {
	it('evaluates hours in UTC whatever the local zone', () => {
		const next = nextCronRuns('30 2 * * *', new Date(Date.UTC(2026, 5, 1, 12, 0)), 1);
		expect(next[0].toISOString()).toBe('2026-06-02T02:30:00.000Z');
	});
});

describe('cronPreview', () => {
	it('wraps success and failure', () => {
		const ok = cronPreview('*/5 * * * *', new Date(Date.UTC(2026, 0, 1, 0, 0)), 2);
		expect(ok.ok).toBe(true);
		if (ok.ok) {
			expect(ok.text).toBe('Every 5 minutes');
			expect(ok.next).toHaveLength(2);
		}
		const bad = cronPreview('nope');
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.error).toMatch(/Expected 5 fields/);
	});
});

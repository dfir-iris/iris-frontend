/**
 * Human-readable preview of a standard 5-field cron expression
 * (`minute hour day-of-month month day-of-week`), plus the next fire
 * times. Supports `*`, lists, ranges, steps, month / weekday names and
 * the `@hourly`-style macros. The backend parser is authoritative; this
 * only helps the author read what they typed.
 */

export type CronPreview = { ok: true; text: string; next: Date[] } | { ok: false; error: string };

interface FieldSpec {
	name: string;
	min: number;
	max: number;
	names?: string[];
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MONTH_LABELS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];
const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const FIELDS: FieldSpec[] = [
	{ name: 'minute', min: 0, max: 59 },
	{ name: 'hour', min: 0, max: 23 },
	{ name: 'day of month', min: 1, max: 31 },
	{ name: 'month', min: 1, max: 12, names: MONTHS },
	{ name: 'day of week', min: 0, max: 7, names: DAYS }
];

const MACROS: Record<string, string> = {
	'@yearly': '0 0 1 1 *',
	'@annually': '0 0 1 1 *',
	'@monthly': '0 0 1 * *',
	'@weekly': '0 0 * * 0',
	'@daily': '0 0 * * *',
	'@midnight': '0 0 * * *',
	'@hourly': '0 * * * *'
};

interface ParsedField {
	raw: string;
	values: Set<number>;
	/** The field is a bare star (or star-slash-1). */
	any: boolean;
	/** Step n when the field is exactly star-slash-n. */
	step: number | null;
}

function parseValue(token: string, spec: FieldSpec): number {
	const lower = token.toLowerCase();
	if (spec.names) {
		const index = spec.names.indexOf(lower);
		if (index >= 0) return spec.min === 1 ? index + 1 : index;
	}
	if (!/^\d+$/.test(token)) throw new Error(`Invalid ${spec.name} value "${token}"`);
	const value = Number(token);
	if (value < spec.min || value > spec.max) {
		throw new Error(`${spec.name} value ${value} is out of range ${spec.min}-${spec.max}`);
	}
	return value;
}

function parseField(raw: string, spec: FieldSpec): ParsedField {
	const values = new Set<number>();
	const whole = /^\*(?:\/(\d+))?$/.exec(raw);
	for (const part of raw.split(',')) {
		if (part === '') throw new Error(`Empty ${spec.name} list item`);
		const [range, stepRaw, ...rest] = part.split('/');
		if (rest.length) throw new Error(`Invalid ${spec.name} "${part}"`);
		let step = 1;
		if (stepRaw !== undefined) {
			if (!/^\d+$/.test(stepRaw) || Number(stepRaw) === 0) {
				throw new Error(`Invalid ${spec.name} step "${stepRaw}"`);
			}
			step = Number(stepRaw);
		}
		let lo: number;
		let hi: number;
		if (range === '*') {
			lo = spec.min;
			hi = spec.max;
		} else if (range.includes('-')) {
			const [a, b, ...more] = range.split('-');
			if (more.length) throw new Error(`Invalid ${spec.name} range "${range}"`);
			lo = parseValue(a, spec);
			hi = parseValue(b, spec);
			if (lo > hi) throw new Error(`Invalid ${spec.name} range "${range}"`);
		} else {
			lo = parseValue(range, spec);
			hi = stepRaw !== undefined ? spec.max : lo;
		}
		for (let v = lo; v <= hi; v += step) values.add(v);
	}
	// Sunday is both 0 and 7.
	if (spec.name === 'day of week' && values.has(7)) {
		values.delete(7);
		values.add(0);
	}
	const stepValue = whole?.[1] ? Number(whole[1]) : null;
	return {
		raw,
		values,
		any: !!whole && (stepValue === null || stepValue === 1),
		step: stepValue && stepValue > 1 ? stepValue : null
	};
}

export interface ParsedCron {
	minute: ParsedField;
	hour: ParsedField;
	dom: ParsedField;
	month: ParsedField;
	dow: ParsedField;
}

/** Throws an `Error` with a readable message on a bad expression. */
export function parseCron(expression: string): ParsedCron {
	const trimmed = (expression ?? '').trim();
	if (!trimmed) throw new Error('Empty cron expression');
	const expanded = MACROS[trimmed.toLowerCase()] ?? trimmed;
	const parts = expanded.split(/\s+/);
	if (parts.length !== 5) {
		throw new Error(`Expected 5 fields (minute hour day month weekday), got ${parts.length}`);
	}
	const [minute, hour, dom, month, dow] = parts.map((p, i) => parseField(p, FIELDS[i]));
	return { minute, hour, dom, month, dow };
}

const pad = (n: number) => String(n).padStart(2, '0');

function joinList(items: string[]): string {
	if (items.length <= 1) return items.join('');
	return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** Sorted values folded into ranges: [1,2,3,5] → [[1,3],[5,5]]. */
function runs(values: Set<number>): [number, number][] {
	const sorted = [...values].sort((a, b) => a - b);
	const out: [number, number][] = [];
	for (const v of sorted) {
		const last = out[out.length - 1];
		if (last && v === last[1] + 1) last[1] = v;
		else out.push([v, v]);
	}
	return out;
}

function describeNamed(values: Set<number>, labels: string[], offset: number): string {
	return joinList(
		runs(values).map(([a, b]) => {
			if (a === b) return labels[a - offset];
			if (b === a + 1) return `${labels[a - offset]} and ${labels[b - offset]}`;
			return `${labels[a - offset]} through ${labels[b - offset]}`;
		})
	);
}

function describeNumbers(values: Set<number>): string {
	return joinList(runs(values).map(([a, b]) => (a === b ? String(a) : `${a}-${b}`)));
}

function describeTime(c: ParsedCron): string {
	const { minute, hour } = c;
	if (minute.any && hour.any) return 'Every minute';
	if (minute.step && hour.any) return `Every ${minute.step} minutes`;
	if (minute.any) {
		return hour.step
			? `Every minute, every ${hour.step} hours`
			: `Every minute during hour ${describeNumbers(hour.values)}`;
	}
	if (minute.step) {
		return hour.step
			? `Every ${minute.step} minutes, every ${hour.step} hours`
			: `Every ${minute.step} minutes during hour ${describeNumbers(hour.values)}`;
	}
	if (hour.any) {
		return minute.values.size === 1
			? `At minute ${[...minute.values][0]} of every hour`
			: `At minutes ${describeNumbers(minute.values)} of every hour`;
	}
	if (hour.step) {
		return `At minute ${describeNumbers(minute.values)}, every ${hour.step} hours`;
	}
	const times: string[] = [];
	for (const h of [...hour.values].sort((a, b) => a - b)) {
		for (const m of [...minute.values].sort((a, b) => a - b)) times.push(`${pad(h)}:${pad(m)}`);
	}
	if (times.length > 6) {
		return `At minute ${describeNumbers(minute.values)} past hour ${describeNumbers(hour.values)}`;
	}
	return `At ${joinList(times)}`;
}

function describeDays(c: ParsedCron): string {
	const parts: string[] = [];
	const domSet = !c.dom.any;
	const dowSet = !c.dow.any;
	const dom = c.dom.step ? `every ${c.dom.step} days` : `on day ${describeNumbers(c.dom.values)}`;
	const dow = `on ${describeNamed(c.dow.values, DAY_LABELS, 0)}`;
	if (domSet && dowSet) parts.push(`${dom} of the month or ${dow}`);
	else if (domSet) parts.push(`${dom} of the month`);
	else if (dowSet) parts.push(dow);
	if (!c.month.any) parts.push(`in ${describeNamed(c.month.values, MONTH_LABELS, 1)}`);
	return parts.join(', ');
}

export function describeCron(expression: string): string {
	const c = parseCron(expression);
	const days = describeDays(c);
	return days ? `${describeTime(c)}, ${days}` : describeTime(c);
}

function dayMatches(c: ParsedCron, d: Date): boolean {
	const domOk = c.dom.values.has(d.getUTCDate());
	const dowOk = c.dow.values.has(d.getUTCDay());
	// Classic cron: when both day fields are restricted, either matches.
	if (!c.dom.any && !c.dow.any) return domOk || dowOk;
	return domOk && dowOk;
}

/**
 * The next `count` fire times strictly after `from`. The backend
 * scheduler evaluates expressions in UTC, so the walk happens in UTC;
 * the returned dates are absolute and may be displayed in any zone.
 */
export function nextCronRuns(expression: string, from: Date = new Date(), count = 3): Date[] {
	const c = parseCron(expression);
	const out: Date[] = [];
	const d = new Date(from.getTime());
	d.setUTCSeconds(0, 0);
	d.setUTCMinutes(d.getUTCMinutes() + 1);
	// Five years ahead covers Feb 29 style expressions; impossible ones
	// (`0 0 31 2 *`) simply yield nothing.
	const end = from.getTime() + 5 * 366 * 24 * 3600 * 1000;
	while (out.length < count && d.getTime() <= end) {
		if (!c.month.values.has(d.getUTCMonth() + 1)) {
			d.setUTCMonth(d.getUTCMonth() + 1, 1);
			d.setUTCHours(0, 0, 0, 0);
		} else if (!dayMatches(c, d)) {
			d.setUTCDate(d.getUTCDate() + 1);
			d.setUTCHours(0, 0, 0, 0);
		} else if (!c.hour.values.has(d.getUTCHours())) {
			d.setUTCHours(d.getUTCHours() + 1, 0, 0, 0);
		} else if (!c.minute.values.has(d.getUTCMinutes())) {
			d.setUTCMinutes(d.getUTCMinutes() + 1, 0, 0);
		} else {
			out.push(new Date(d.getTime()));
			d.setUTCMinutes(d.getUTCMinutes() + 1, 0, 0);
		}
	}
	return out;
}

export function cronPreview(expression: string, from: Date = new Date(), count = 3): CronPreview {
	try {
		return {
			ok: true,
			text: describeCron(expression),
			next: nextCronRuns(expression, from, count)
		};
	} catch (e) {
		return { ok: false, error: (e as Error).message };
	}
}

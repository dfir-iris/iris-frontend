/**
 * The one place dates are parsed and rendered.
 *
 * Everything here renders in the user's display timezone (see
 * `$lib/stores/timezone.store.svelte`), never in whatever zone the
 * browser happens to be in, and with the user's 12h/24h clock (see
 * `$lib/stores/time-format.store.svelte`). Components must not call
 * `Date#toLocaleString` / `getHours` & co. directly: those always use
 * the browser zone and silently disagree with the rest of the UI.
 *
 * Reading the zone goes through a rune store, so a template or
 * `$derived` that calls one of these re-renders when the user changes
 * their preference.
 */
import {
	fromDate,
	parseDate,
	parseDateTime,
	toCalendarDate,
	toZoned
} from '@internationalized/date';
import type { ZonedDateTime } from '@internationalized/date';
import { timezone } from '$lib/stores/timezone.store.svelte';
import { timeFormat } from '$lib/stores/time-format.store.svelte';

export type DateInput = string | number | Date | null | undefined;

// `2026-09-30T10:00:00`, `2026-09-30 10:00:00.123456`: no offset.
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;
// `2026-09-30`: a calendar day, not an instant.
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const isDateOnly = (value: DateInput): boolean =>
	typeof value === 'string' && DATE_ONLY.test(value.trim());

/**
 * Parse a date coming from the API.
 *
 * Most backend columns are timezone-less `DateTime`s holding UTC, and
 * are serialised without an offset. `new Date()` reads an offset-less
 * ISO string as *browser-local* time, which shifts every such value by
 * the browser's UTC offset. Offset-less date-times are therefore pinned
 * to UTC here. Strings that carry an offset, epoch numbers and `Date`s
 * pass through unchanged.
 *
 * Returns `null` for empty or unparseable input.
 */
export const parseServerDate = (value: DateInput): Date | null => {
	if (value === null || value === undefined || value === '') return null;

	let date: Date;
	if (value instanceof Date) {
		date = value;
	} else if (typeof value === 'number') {
		date = new Date(value);
	} else {
		const trimmed = value.trim();
		date = new Date(NAIVE_DATETIME.test(trimmed) ? `${trimmed.replace(' ', 'T')}Z` : trimmed);
	}

	return Number.isNaN(date.getTime()) ? null : date;
};

/**
 * Put the user's clock on anything that renders an hour. A caller's own
 * `hour12` / `hourCycle` is dropped on purpose: one screen mixing `14:48`
 * and `02:48 PM` is exactly what the preference exists to prevent.
 */
const withClock = (options: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions => {
	if (options.hour === undefined && options.timeStyle === undefined) return options;
	const clocked = { ...options };
	delete clocked.hour12;
	delete clocked.hourCycle;
	const hourCycle = timeFormat.hourCycle;
	return hourCycle ? { ...clocked, hourCycle } : clocked;
};

const formatters = new Map<string, Intl.DateTimeFormat>();

const formatterFor = (requested: Intl.DateTimeFormatOptions, zone: string): Intl.DateTimeFormat => {
	const options = withClock(requested);
	const key = `${zone}|${JSON.stringify(options)}`;
	let formatter = formatters.get(key);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat(undefined, { ...options, timeZone: zone });
		formatters.set(key, formatter);
	}
	return formatter;
};

const format = (value: DateInput, options: Intl.DateTimeFormatOptions): string => {
	const date = parseServerDate(value);
	if (!date) return '';
	// A bare calendar day parses as UTC midnight; rendering it in a zone
	// west of UTC would show the previous day.
	const zone = isDateOnly(value) ? 'UTC' : timezone.zone;
	return formatterFor(options, zone).format(date);
};

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
	year: 'numeric',
	month: 'numeric',
	day: 'numeric'
};

const TIME_OPTIONS: Intl.DateTimeFormatOptions = {
	hour: 'numeric',
	minute: 'numeric',
	second: 'numeric'
};

/** Date and time. Defaults match `Date#toLocaleString()`. Empty string on bad input. */
export const formatDateTime = (
	value: DateInput,
	options: Intl.DateTimeFormatOptions = { ...DATE_OPTIONS, ...TIME_OPTIONS }
): string => format(value, options);

/** Date only. Defaults match `Date#toLocaleDateString()`. Empty string on bad input. */
export const formatDate = (
	value: DateInput,
	options: Intl.DateTimeFormatOptions = DATE_OPTIONS
): string => format(value, options);

/** Time only. Defaults match `Date#toLocaleTimeString()`. Empty string on bad input. */
export const formatTime = (
	value: DateInput,
	options: Intl.DateTimeFormatOptions = TIME_OPTIONS
): string => format(value, options);

/** `Jun 15, 2024, 12:30 PM` — the house style for timestamps. */
export const mediumDateTimeFormatter = (value: DateInput): string =>
	format(value, { dateStyle: 'medium', timeStyle: 'short' });

/** Short name of the display timezone at `at` (default now): `UTC`, `CEST`, `GMT+2`. */
export const timeZoneLabel = (at: DateInput = Date.now()): string => {
	const date = parseServerDate(at) ?? new Date();
	const parts = formatterFor({ timeZoneName: 'short' }, timezone.zone).formatToParts(date);
	return parts.find((p) => p.type === 'timeZoneName')?.value ?? timezone.zone;
};

/**
 * The instant as wall-clock fields (`year`, `month` 1-12, `day`, `hour`,
 * `minute`, `second`) in the display timezone. `null` on bad input.
 */
export const zonedDateTime = (value: DateInput): ZonedDateTime | null => {
	const date = parseServerDate(value);
	return date ? fromDate(date, timezone.zone) : null;
};

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

const zonedDay = (zoned: ZonedDateTime): string =>
	`${pad(zoned.year, 4)}-${pad(zoned.month)}-${pad(zoned.day)}`;

/** `YYYY-MM-DD` of the instant in the display timezone. Empty string on bad input. */
export const dayKey = (value: DateInput): string => {
	const zoned = zonedDateTime(value);
	return zoned ? zonedDay(zoned) : '';
};

/**
 * Whole calendar days from `from` to `to` in the display timezone:
 * 0 on the same day, 1 when `to` is the day after `from`, regardless
 * of the hours between them. `NaN` on bad input.
 */
export const calendarDaysBetween = (from: DateInput, to: DateInput): number => {
	const a = zonedDateTime(from);
	const b = zonedDateTime(to);
	if (!a || !b) return Number.NaN;
	return toCalendarDate(b).compare(toCalendarDate(a));
};

/**
 * Heading for a `dayKey` group: `Today · Jun 15`, `Yesterday · Jun 14`,
 * `Thu, Jun 13`, with `, 2023` appended outside the current year. "Today"
 * is the current day in the display timezone. Unparseable keys are
 * returned as-is.
 */
export const formatDayHeading = (key: string): string => {
	let days: number;
	try {
		days = parseDate(dayKey(Date.now())).compare(parseDate(key));
	} catch {
		return key;
	}
	const monthDay = formatDate(key, { month: 'short', day: 'numeric' });
	const year = key.slice(0, 4) !== dayKey(Date.now()).slice(0, 4) ? `, ${key.slice(0, 4)}` : '';
	if (days === 0) return `Today · ${monthDay}${year}`;
	if (days === 1) return `Yesterday · ${monthDay}${year}`;
	return `${formatDate(key, { weekday: 'short' })}, ${monthDay}${year}`;
};

/**
 * Value for an `<input type="datetime-local">`: `YYYY-MM-DDTHH:mm`
 * (`:ss` with `withSeconds`) in the display timezone. Empty string on
 * bad input.
 */
export const toDateTimeInputValue = (value: DateInput, withSeconds = false): string => {
	const zoned = zonedDateTime(value);
	if (!zoned) return '';
	const seconds = withSeconds ? `:${pad(zoned.second)}` : '';
	return `${zonedDay(zoned)}T${pad(zoned.hour)}:${pad(zoned.minute)}${seconds}`;
};

/**
 * Read an `<input type="datetime-local">` value. The input has no
 * notion of timezone, so its wall-clock is taken to be in the display
 * timezone — the same zone the surrounding UI shows. On DST gaps and
 * overlaps the earlier valid instant wins. `null` on empty or bad input.
 */
export const fromDateTimeInputValue = (value: string | null | undefined): Date | null => {
	if (!value) return null;
	try {
		return toZoned(parseDateTime(value), timezone.zone, 'compatible').toDate();
	} catch {
		return null;
	}
};

/**
 * The instant as an offset-less UTC string (`YYYY-MM-DDTHH:mm:ss`), the
 * shape the backend's timezone-less columns hold. Sending an offset
 * would land an aware value next to naive ones. `undefined` on bad input.
 */
export const toNaiveUtc = (value: DateInput): string | undefined =>
	parseServerDate(value)?.toISOString().slice(0, 19);

/** Value for an `<input type="date">`: the display-timezone day. */
export const toDateInputValue = (value: DateInput): string => dayKey(value);

/**
 * Midnight at the start of an `<input type="date">` day in the display
 * timezone. `null` on empty or bad input.
 */
export const fromDateInputValue = (value: string | null | undefined): Date | null =>
	value ? fromDateTimeInputValue(`${value}T00:00`) : null;

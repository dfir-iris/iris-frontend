/**
 * Pure helpers of the timeline search view: time ranges, histogram
 * arithmetic, the clauses the field buttons write into the search bar,
 * and the drag payload that carries events onto a timeline.
 */
import { quoteIfNeeded } from '$lib/search/lucene';
import { parseServerDate } from '$lib/utils/time-formatter';
import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';

export type TimeRangePresetKey = 'all' | '15m' | '1h' | '24h' | '7d' | '30d' | '90d' | '1y';

export const TIME_RANGE_PRESETS: readonly {
	key: TimeRangePresetKey;
	label: string;
	seconds: number | null;
}[] = [
	{ key: 'all', label: 'All time', seconds: null },
	{ key: '15m', label: 'Last 15 minutes', seconds: 15 * 60 },
	{ key: '1h', label: 'Last hour', seconds: 3600 },
	{ key: '24h', label: 'Last 24 hours', seconds: 86400 },
	{ key: '7d', label: 'Last 7 days', seconds: 7 * 86400 },
	{ key: '30d', label: 'Last 30 days', seconds: 30 * 86400 },
	{ key: '90d', label: 'Last 90 days', seconds: 90 * 86400 },
	{ key: '1y', label: 'Last year', seconds: 365 * 86400 }
];

/**
 * What the search is narrowed to in time. A preset is relative, so it is
 * resolved against the clock on every search rather than once; `custom`
 * is absolute — set in the picker, or by zooming on the histogram — and
 * may be open on one side: only `end` is "before", only `start` "after".
 */
export type TimeRange =
	| { kind: 'preset'; preset: TimeRangePresetKey }
	| { kind: 'custom'; start: string | null; end: string | null };

export type CustomRangeMode = 'between' | 'before' | 'after';

export const customRangeMode = (range: TimeRange): CustomRangeMode => {
	if (range.kind !== 'custom' || (range.start && range.end)) return 'between';
	return range.end ? 'before' : 'after';
};

/**
 * The custom range the picker's inputs describe, or why they do not
 * describe one. `start` and `end` are instants, already read from the
 * inputs in the display timezone.
 */
export const customTimeRange = (
	mode: CustomRangeMode,
	start: Date | null,
	end: Date | null
): TimeRange | { error: string } => {
	if (mode === 'after') {
		return start
			? { kind: 'custom', start: start.toISOString(), end: null }
			: { error: 'Set a date.' };
	}
	if (mode === 'before') {
		return end ? { kind: 'custom', start: null, end: end.toISOString() } : { error: 'Set a date.' };
	}
	if (!start || !end) return { error: 'Set both dates.' };
	if (start.getTime() >= end.getTime()) return { error: 'The start must come before the end.' };
	return { kind: 'custom', start: start.toISOString(), end: end.toISOString() };
};

/** How a range reads in the UI; null for all time. */
export const timeRangeLabel = (
	range: TimeRange,
	format: (iso: string) => string
): string | null => {
	if (range.kind === 'preset') {
		if (range.preset === 'all') return null;
		return TIME_RANGE_PRESETS.find((p) => p.key === range.preset)?.label ?? null;
	}
	if (range.start && range.end) return `${format(range.start)} → ${format(range.end)}`;
	if (range.end) return `Before ${format(range.end)}`;
	if (range.start) return `After ${format(range.start)}`;
	return null;
};

export const ALL_TIME: TimeRange = { kind: 'preset', preset: 'all' };

/** `[start, end)` as ISO strings, `null` meaning unbounded. */
export const resolveTimeRange = (
	range: TimeRange,
	now: Date = new Date()
): { start: string | null; end: string | null } => {
	if (range.kind === 'custom') return { start: range.start, end: range.end };

	const seconds = TIME_RANGE_PRESETS.find((p) => p.key === range.preset)?.seconds ?? null;
	if (seconds === null) return { start: null, end: null };

	return { start: new Date(now.getTime() - seconds * 1000).toISOString(), end: null };
};

const UNITS: readonly [number, string, string][] = [
	[86400, 'day', 'days'],
	[3600, 'hour', 'hours'],
	[60, 'minute', 'minutes'],
	[1, 'second', 'seconds']
];

/** `3600` → `1 hour`, `1800` → `30 minutes`: the largest unit that divides evenly. */
export const formatInterval = (seconds: number): string => {
	for (const [size, one, many] of UNITS) {
		if (seconds >= size && seconds % size === 0) {
			const n = seconds / size;
			return `${n} ${n === 1 ? one : many}`;
		}
	}
	return `${seconds} seconds`;
};

/** Milliseconds since the epoch of a server date (naive strings are UTC). */
export const serverDateMs = (value: string): number => parseServerDate(value)?.getTime() ?? NaN;

/**
 * The window covered by buckets `from`..`to` (inclusive, either order),
 * as the `[start, end)` a histogram drag or double-click zooms to.
 */
export const bucketsRange = (
	buckets: readonly { start: string }[],
	intervalSeconds: number,
	from: number,
	to: number
): { start: string; end: string } | null => {
	const first = Math.max(0, Math.min(from, to));
	const last = Math.min(buckets.length - 1, Math.max(from, to));
	if (!buckets.length || first > last) return null;

	const start = serverDateMs(buckets[first].start);
	const end = serverDateMs(buckets[last].start) + intervalSeconds * 1000;
	if (Number.isNaN(start) || Number.isNaN(end)) return null;

	return { start: new Date(start).toISOString(), end: new Date(end).toISOString() };
};

/**
 * The clause a field button writes: `asset:DC01`, or `-asset:DC01` to
 * exclude. Values are quoted when the grammar needs it, so a value with
 * a space or a colon reaches the backend as one term.
 */
export const fieldClause = (alias: string, value: string, exclude = false): string =>
	`${exclude ? '-' : ''}${alias}:${quoteIfNeeded(value)}`;

export const eventTags = (event: Pick<CaseTimelineEvent, 'event_tags'>): string[] =>
	(event.event_tags ?? '')
		.split(',')
		.map((tag) => tag.trim())
		.filter(Boolean);

/** Type of the drag payload carrying event ids onto a timeline. */
export const EVENTS_DRAG_MIME = 'application/x-iris-timeline-events';

export const encodeDraggedEvents = (eventIds: readonly number[]): string =>
	JSON.stringify(eventIds);

/** Event ids of a drop, or `[]` when the payload is not ours. */
export const decodeDraggedEvents = (payload: string): number[] => {
	try {
		const parsed: unknown = JSON.parse(payload);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter((id): id is number => Number.isInteger(id) && id > 0);
	} catch {
		return [];
	}
};

/**
 * The events a row drag carries: the whole selection when the dragged
 * row is part of it, the row alone otherwise — the way a file manager
 * drags a selection.
 */
export const draggedEventIds = (eventId: number, selected: ReadonlySet<number>): number[] =>
	selected.has(eventId) ? [...selected] : [eventId];

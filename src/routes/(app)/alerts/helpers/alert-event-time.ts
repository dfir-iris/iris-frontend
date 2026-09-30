import { fromDateTimeInputValue, toNaiveUtc } from '$lib/utils/time-formatter';

/**
 * Convert a `datetime-local` form value into what
 * `alert_source_event_time` expects.
 *
 * The input speaks wall-clock with no offset, read in the user's display
 * timezone; the column is a timezone-less DateTime. Sending an
 * offset-bearing string ("…Z", "…+02:00") would land an aware value in a
 * naive column, so the time is converted to UTC and the suffix dropped —
 * the same instant, in the shape the column holds.
 *
 * Returns `undefined` for an empty or unparseable value, which the
 * caller omits from the payload so the server default (now) applies.
 */
export const alertEventTimeForApi = (value: string): string | undefined =>
	toNaiveUtc(fromDateTimeInputValue(value));

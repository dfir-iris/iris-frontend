/**
 * Convert a `datetime-local` form value into what
 * `alert_source_event_time` expects.
 *
 * The input speaks local wall-clock with no offset; the column is a
 * timezone-less DateTime. Sending an offset-bearing string ("…Z",
 * "…+02:00") would land an aware value in a naive column, so the local
 * time is converted to UTC and the suffix dropped — the same instant,
 * in the shape the column holds.
 *
 * Returns `undefined` for an empty or unparseable value, which the
 * caller omits from the payload so the server default (now) applies.
 */
export const alertEventTimeForApi = (value: string): string | undefined => {
	if (!value) return undefined;

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return undefined;

	return parsed.toISOString().slice(0, 19);
};

import type { CaseTimelineEvent } from '$lib/services/case-timeline.service';

// Deterministic palette keyed off the category name, so a timeline still
// reads as colour-coded when nobody set an event colour.
const CATEGORY_PALETTE = [
	'#3b82f6', // blue
	'#10b981', // emerald
	'#f59e0b', // amber
	'#ef4444', // red
	'#8b5cf6', // violet
	'#06b6d4', // cyan
	'#ec4899', // pink
	'#84cc16', // lime
	'#f97316', // orange
	'#14b8a6' // teal
];

const hashString = (s: string): number => {
	let h = 0;
	for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
	return h;
};

/** The user-defined event colour, else the category's palette colour. */
export const eventAccentColor = (
	event: Pick<CaseTimelineEvent, 'event_color' | 'category_name'>
): string =>
	event.event_color && event.event_color.trim()
		? event.event_color
		: CATEGORY_PALETTE[hashString(event.category_name ?? 'Unspecified') % CATEGORY_PALETTE.length];

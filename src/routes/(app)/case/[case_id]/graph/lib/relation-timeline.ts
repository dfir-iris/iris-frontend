/**
 * "Record in the timeline" option of the new relation dialog: the existing
 * events recording the link are attached to the edge, and a new event can be
 * created and cited by it.
 */
import type {
	CreateGraphEdgeBody,
	GraphNodeKey,
	GraphTimelineEventFields
} from '$lib/types/resources/case-graph';
import { parseNodeKey } from './model';

export interface RelationTimelineState {
	/** Existing events to cite. */
	attach: number[];
	create: boolean;
	/** Empty: the suggested title. */
	title: string;
	/** `<input type="datetime-local">` value. */
	date: string;
	tz: string;
	categoryId: number | null;
}

export type RelationTimelineChoice = Pick<CreateGraphEdgeBody, 'event_ids' | 'timeline_event'>;

/** Event category name fragment (lower case) per relation, mirroring the
 * backend derivation so the new event derives the same relation. */
const RELATION_CATEGORIES: Record<string, string> = {
	lateral_movement: 'lateral movement',
	exfiltrated_to: 'exfiltration',
	beacons_to: 'command and control',
	executed_on: 'execution',
	authenticated_to: 'credential access'
};

/** The timeline only links assets and IOCs; an event endpoint is already
 * in the timeline. */
export const relationTimelineAvailable = (source: GraphNodeKey, target: GraphNodeKey) =>
	parseNodeKey(source)?.kind !== 'event' && parseNodeKey(target)?.kind !== 'event';

export const relationTimelineLinks = (key: GraphNodeKey) => {
	const kind = parseNodeKey(key)?.kind;
	return kind === 'asset' || kind === 'ioc';
};

export const defaultEventCategoryId = (
	categories: { id: number; name: string }[],
	relationName: string
): number | null => {
	const fragment = RELATION_CATEGORIES[relationName];
	const byName = (match: (name: string) => boolean) =>
		categories.find((c) => match(c.name.toLowerCase()))?.id;
	return (
		(fragment ? byName((n) => n.includes(fragment)) : undefined) ??
		byName((n) => n === 'unspecified') ??
		categories[0]?.id ??
		null
	);
};

const pad = (n: number) => String(n).padStart(2, '0');

/** Current UTC time as a `datetime-local` value, to pair with `+00:00`. */
export const nowUtcInput = (now = new Date()) =>
	`${now.getUTCFullYear()}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}T${pad(
		now.getUTCHours()
	)}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;

/** `datetime-local` value (seconds optional) -> `YYYY-MM-DDTHH:mm:ss.SSS`. */
export const toEventDate = (input: string): string | null => {
	const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(input.trim());
	if (!m) return null;
	return `${m[1]}T${m[2]}:${m[3] ?? '00'}.${(m[4] ?? '').padEnd(3, '0')}`;
};

export const isTzOffset = (tz: string) => /^[+-]\d{2}:\d{2}$/.test(tz.trim());

export const relationTimelineTitle = (from: string, relation: string, to: string) =>
	`${from} ${relation.toLowerCase()} ${to}`;

/** Request fields of the choice; throws with a user-facing message when
 * the new event is incomplete. */
export const relationTimelineChoice = (
	state: RelationTimelineState,
	suggestedTitle: string
): RelationTimelineChoice => {
	const choice: RelationTimelineChoice = {};
	if (state.attach.length) choice.event_ids = [...state.attach];
	if (!state.create) return choice;
	const eventDate = toEventDate(state.date);
	if (!eventDate) throw new Error('The timeline event needs a valid date and time.');
	if (!isTzOffset(state.tz)) throw new Error('The timezone is an offset such as +00:00.');
	if (state.categoryId === null) throw new Error('The timeline event needs a category.');
	const event: GraphTimelineEventFields = {
		event_title: state.title.trim() || suggestedTitle,
		event_date: eventDate,
		event_tz: state.tz.trim(),
		event_category_id: state.categoryId
	};
	choice.timeline_event = event;
	return choice;
};

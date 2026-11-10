/**
 * Small pure helpers of the tracker views (history wording, members,
 * the step board).
 */
import type { RequestResponse } from '$lib/services/api.service';
import type {
	TrackerColumn,
	TrackerEvent,
	TrackerRow,
	TrackerStep
} from '$lib/services/war-room-trackers.service';

/** The JSON body of a successful call, null on failure or a non-object body. */
export const okObject = <T extends object>(res: RequestResponse<T>): T | null =>
	res.ok && res.data !== null && typeof res.data === 'object' ? (res.data as T) : null;

/** A member (of the war room, or with access to the case) offered by `user` columns. */
export interface TrackerMemberOption {
	id: number;
	name: string;
}

/** The pseudo-column the note cell edits. */
export const TRACKER_NOTE_COLUMN: Pick<TrackerColumn, 'type' | 'label'> = {
	type: 'longtext',
	label: 'Note'
};

const short = (value: unknown, max = 80): string => {
	if (value === null || value === undefined || value === '') return '∅';
	const text = Array.isArray(value) ? value.join(', ') : String(value);
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** One line describing a history event ("added step Email sent"). */
export const describeTrackerEvent = (
	event: Pick<TrackerEvent, 'action' | 'details'>,
	context: { steps?: TrackerStep[]; columns?: TrackerColumn[] } = {}
): string => {
	const d = (event.details ?? {}) as Record<string, unknown>;
	const stepName = () => {
		if (typeof d.step_name === 'string' && d.step_name) return d.step_name;
		const step = context.steps?.find((s) => s.id === d.step_id);
		return step?.name ?? `#${String(d.step_id ?? '?')}`;
	};
	switch (event.action) {
		case 'created':
			return d.label ? `added the row "${short(d.label)}"` : 'added the row';
		case 'deleted':
			return d.label ? `removed the row "${short(d.label)}"` : 'removed the row';
		case 'step_added':
			return `added step ${stepName()}`;
		case 'step_removed':
			return `removed step ${stepName()}`;
		case 'note_changed':
			return d.new ? `set the note to "${short(d.new)}"` : 'cleared the note';
		case 'label_changed':
			// An item row has no label until given a custom one.
			if (!d.new) return `removed the label "${short(d.old)}"`;
			if (!d.old) return `labelled the row "${short(d.new)}"`;
			return `renamed "${short(d.old)}" to "${short(d.new)}"`;
		case 'value_changed': {
			const label =
				(typeof d.column_label === 'string' && d.column_label) ||
				context.columns?.find((c) => c.key === d.column_key)?.label ||
				String(d.column_key ?? 'a column');
			return d.new === null || d.new === undefined || d.new === ''
				? `cleared ${label}`
				: `set ${label} to "${short(d.new)}"`;
		}
		default:
			return String(event.action).replace(/_/g, ' ');
	}
};

/**
 * Rows per item (`asset:44`) of a tracker: an item can have several
 * rows in a manual tracker. Free-text rows are not counted.
 */
export const trackerItemCounts = (
	rows: { item_type: string | null; item_id: number | null }[]
): Map<string, number> => {
	const counts = new Map<string, number>();
	for (const row of rows) {
		if (!row.item_type || row.item_id == null) continue;
		const key = `${row.item_type}:${row.item_id}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
};

/** How a tracker shows its rows: the table, or one column per step. */
export type TrackerView = 'list' | 'board';

export const isTrackerView = (v: unknown): v is TrackerView => v === 'list' || v === 'board';

export interface TrackerBoardColumn<R extends Pick<TrackerRow, 'steps'> = TrackerRow> {
	key: string;
	/** null = the rows without any of the listed steps. */
	step: TrackerStep | null;
	rows: R[];
}

/**
 * The step board: "No step", then one column per step in the given
 * order. A row carrying several steps shows in each of their columns;
 * one carrying none of them goes to "No step".
 */
export function trackerBoardColumns<R extends Pick<TrackerRow, 'steps'>>(
	rows: R[],
	steps: TrackerStep[]
): TrackerBoardColumn<R>[] {
	const listed = new Set(steps.map((s) => s.id));
	const buckets = new Map<number | null, R[]>();
	const push = (key: number | null, row: R) => {
		const list = buckets.get(key);
		if (list) list.push(row);
		else buckets.set(key, [row]);
	};
	for (const row of rows) {
		const carried = row.steps.filter((s) => listed.has(s.step_id));
		if (carried.length === 0) push(null, row);
		for (const s of carried) push(s.step_id, row);
	}
	return [
		{ key: 'none', step: null, rows: buckets.get(null) ?? [] },
		...steps.map((step) => ({ key: String(step.id), step, rows: buckets.get(step.id) ?? [] }))
	];
}

/**
 * The step change of a card dragged from the column of step `from` to the
 * one of step `to` (null = "No step"): the row loses the first and gets
 * the second, keeping its other steps. Null when nothing changes.
 */
export function trackerBoardMove(
	row: Pick<TrackerRow, 'steps'>,
	from: number | null,
	to: number | null
): { add_step_ids: number[]; remove_step_ids: number[] } | null {
	if (from === to) return null;
	const carried = new Set(row.steps.map((s) => s.step_id));
	const add = to !== null && !carried.has(to) ? [to] : [];
	const remove = from !== null && carried.has(from) ? [from] : [];
	if (add.length === 0 && remove.length === 0) return null;
	return { add_step_ids: add, remove_step_ids: remove };
}

/**
 * Sorting and grouping of the rows of a tracker (case or war room), and
 * the per-tracker memory of both. Pure helpers: the panels pass the
 * labels, steps and columns of their tracker.
 */
import type {
	TrackerColumn,
	TrackerRowStep,
	TrackerStep,
	TrackerUserRef,
	TrackerValue
} from '$lib/services/war-room-trackers.service';

/** What the helpers read of a row (case and war-room rows both fit). */
export interface TrackerLayoutRow {
	key: string;
	item_type: string | null;
	item_id: number | null;
	steps: TrackerRowStep[];
	note: string | null;
	values: Record<string, TrackerValue>;
	updated_at: string | null;
	updated_by: TrackerUserRef | null;
}

export type TrackerSortDir = 'asc' | 'desc';

/**
 * `item`, `type`, `steps`, `note`, `updated`, or `col:<key>` for an
 * extra column.
 */
export interface TrackerSort {
	key: string;
	dir: TrackerSortDir;
}

/** `item`, `type`, `step`, `updated_by`, or `col:<key>`; null = no grouping. */
export type TrackerGroupBy = string | null;

export interface TrackerLayout {
	sort: TrackerSort | null;
	group: TrackerGroupBy;
}

export interface TrackerLayoutContext<R extends TrackerLayoutRow> {
	/** Display name of a row (custom label included). */
	label: (row: R) => string;
	/** Name of the item of a row, without the custom label. */
	itemName: (row: R) => string;
	/** "Asset", "IOC"…; "Free text" for a row without item. */
	typeLabel: (row: R) => string;
	columns: TrackerColumn[];
	/** The steps, in display order. */
	steps: TrackerStep[];
	userName?: (id: number) => string | null | undefined;
}

export interface TrackerRowGroup<R> {
	key: string;
	label: string;
	/** Set when grouping by step (null: the rows without any step). */
	step?: TrackerStep | null;
	rows: R[];
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const columnOf = (columns: TrackerColumn[], key: string): TrackerColumn | null =>
	key.startsWith('col:') ? (columns.find((c) => c.key === key.slice(4)) ?? null) : null;

const isEmpty = (value: unknown): boolean =>
	value === null ||
	value === undefined ||
	value === '' ||
	(Array.isArray(value) && value.length === 0);

/** The value a column sorts on: a number, or text (null when empty). */
const columnSortValue = <R extends TrackerLayoutRow>(
	row: R,
	column: TrackerColumn,
	ctx: TrackerLayoutContext<R>
): number | string | null => {
	const value = row.values?.[column.key];
	if (column.type === 'checkbox') return value === true ? 1 : 0;
	if (isEmpty(value)) return null;
	if (column.type === 'number') {
		const n = typeof value === 'number' ? value : Number(value);
		return Number.isFinite(n) ? n : String(value);
	}
	if (column.type === 'user' && typeof value === 'number') {
		return ctx.userName?.(value) ?? `User #${value}`;
	}
	if (Array.isArray(value)) return value.join(', ');
	return String(value);
};

const sortValue = <R extends TrackerLayoutRow>(
	row: R,
	key: string,
	ctx: TrackerLayoutContext<R>,
	stepIndex: Map<number, number>
): number | string | null => {
	switch (key) {
		case 'item':
			return ctx.label(row) || null;
		case 'type':
			return ctx.typeLabel(row);
		case 'note':
			return row.note || null;
		case 'updated':
			return row.updated_at;
		case 'steps': {
			// The furthest step a row reached, in display order.
			const indices = row.steps
				.map((s) => stepIndex.get(s.step_id))
				.filter((i): i is number => i !== undefined);
			return indices.length ? Math.max(...indices) : null;
		}
		default: {
			const column = columnOf(ctx.columns, key);
			return column ? columnSortValue(row, column, ctx) : null;
		}
	}
};

const compareValues = (a: number | string, b: number | string): number =>
	typeof a === 'number' && typeof b === 'number' ? a - b : collator.compare(String(a), String(b));

/** Whether `sort` can apply to a tracker with these columns. */
export const trackerSortIsValid = (sort: TrackerSort | null, columns: TrackerColumn[]): boolean =>
	!!sort &&
	(['item', 'type', 'steps', 'note', 'updated'].includes(sort.key) ||
		columnOf(columns, sort.key) !== null);

/**
 * The rows sorted on `sort` (stable: equal rows keep their order); empty
 * values last in both directions. Null or an unknown key: unchanged.
 */
export function sortTrackerRows<R extends TrackerLayoutRow>(
	rows: R[],
	sort: TrackerSort | null,
	ctx: TrackerLayoutContext<R>
): R[] {
	if (!sort || !trackerSortIsValid(sort, ctx.columns)) return rows;
	const stepIndex = new Map(ctx.steps.map((s, i) => [s.id, i]));
	const sign = sort.dir === 'desc' ? -1 : 1;
	return rows
		.map((row, index) => ({ row, index, value: sortValue(row, sort.key, ctx, stepIndex) }))
		.sort((a, b) => {
			if (a.value === null || b.value === null) {
				if (a.value === b.value) return a.index - b.index;
				return a.value === null ? 1 : -1;
			}
			return sign * compareValues(a.value, b.value) || a.index - b.index;
		})
		.map((entry) => entry.row);
}

/** Next sort when a column header is clicked: ascending, descending, then none. */
export const nextTrackerSort = (sort: TrackerSort | null, key: string): TrackerSort | null => {
	if (sort?.key !== key) return { key, dir: 'asc' };
	return sort.dir === 'asc' ? { key, dir: 'desc' } : null;
};

/** The ways a tracker's rows can be grouped. */
export const trackerGroupOptions = (
	columns: TrackerColumn[],
	options: { manual: boolean }
): { value: string; label: string }[] => [
	...(options.manual
		? [
				{ value: 'item', label: 'Item' },
				{ value: 'type', label: 'Item type' }
			]
		: []),
	{ value: 'step', label: 'Step' },
	{ value: 'updated_by', label: 'Last updated by' },
	...columns
		.filter((c) => c.type !== 'longtext')
		.map((c) => ({ value: `col:${c.key}`, label: c.label }))
];

/** Whether `group` can apply to a tracker with these columns. */
export const trackerGroupIsValid = (
	group: TrackerGroupBy,
	columns: TrackerColumn[],
	manual: boolean
): boolean =>
	group !== null && trackerGroupOptions(columns, { manual }).some((o) => o.value === group);

const EMPTY = '__empty__';

/** `[key, label]` of the groups a row belongs to (several for steps and multi-selects). */
const groupsOf = <R extends TrackerLayoutRow>(
	row: R,
	group: string,
	ctx: TrackerLayoutContext<R>,
	stepIds: Set<number>
): [string, string][] => {
	switch (group) {
		case 'item': {
			if (row.item_type && row.item_id != null) {
				return [[`${row.item_type}:${row.item_id}`, ctx.itemName(row)]];
			}
			// Free-text rows group by their text.
			const text = ctx.itemName(row).trim();
			return text ? [[`text:${text}`, text]] : [[EMPTY, 'Free text']];
		}
		case 'type':
			return [[row.item_type ?? EMPTY, ctx.typeLabel(row)]];
		case 'updated_by':
			return row.updated_by
				? [[String(row.updated_by.id), row.updated_by.name]]
				: [[EMPTY, 'Never updated']];
		case 'step': {
			const carried = row.steps.filter((s) => stepIds.has(s.step_id));
			return carried.length ? carried.map((s) => [String(s.step_id), '']) : [[EMPTY, 'No step']];
		}
		default: {
			const column = columnOf(ctx.columns, group);
			if (!column) return [];
			const value = row.values?.[column.key];
			if (column.type === 'checkbox') return value === true ? [['1', 'Yes']] : [['0', 'No']];
			if (isEmpty(value)) return [[EMPTY, `No ${column.label}`]];
			if (Array.isArray(value)) return value.map((v) => [v, v]);
			if (column.type === 'user' && typeof value === 'number') {
				return [[String(value), ctx.userName?.(value) ?? `User #${value}`]];
			}
			// A day per group, not a minute.
			if (column.type === 'datetime') {
				const day = String(value).slice(0, 10);
				return [[day, day]];
			}
			return [[String(value), String(value)]];
		}
	}
};

/**
 * The rows split by `group`, keeping their order inside each group. A row
 * with several steps (or multi-select values) shows in each of their
 * groups. Steps and select options keep their own order; other groups
 * are sorted by name, the empty group last.
 */
export function groupTrackerRows<R extends TrackerLayoutRow>(
	rows: R[],
	group: string,
	ctx: TrackerLayoutContext<R>
): TrackerRowGroup<R>[] {
	const stepIds = new Set(ctx.steps.map((s) => s.id));
	const groups = new Map<string, TrackerRowGroup<R>>();
	for (const row of rows) {
		for (const [key, label] of groupsOf(row, group, ctx, stepIds)) {
			const existing = groups.get(key);
			if (existing) existing.rows.push(row);
			else groups.set(key, { key, label, rows: [row] });
		}
	}
	const list = [...groups.values()];
	const empty = list.filter((g) => g.key === EMPTY);
	const rest = list.filter((g) => g.key !== EMPTY);
	if (group === 'step') {
		const byId = new Map(ctx.steps.map((s) => [String(s.id), s]));
		const ordered = ctx.steps
			.map((s) => groups.get(String(s.id)))
			.filter((g): g is TrackerRowGroup<R> => !!g)
			.map((g) => ({ ...g, label: byId.get(g.key)?.name ?? '', step: byId.get(g.key) }));
		return [...ordered, ...empty.map((g) => ({ ...g, step: null }))];
	}
	const column = columnOf(ctx.columns, group);
	if (column?.options?.length) {
		const rank = new Map(column.options.map((o, i) => [o, i]));
		rest.sort(
			(a, b) =>
				(rank.get(a.key) ?? Infinity) - (rank.get(b.key) ?? Infinity) ||
				collator.compare(a.label, b.label)
		);
	} else if (column?.type === 'number') {
		rest.sort((a, b) => Number(a.key) - Number(b.key));
	} else if (column?.type === 'checkbox') {
		rest.sort((a, b) => b.key.localeCompare(a.key));
	} else {
		rest.sort((a, b) => collator.compare(a.label, b.label));
	}
	return [...rest, ...empty];
}

const LAYOUT_PREFIX = 'iris_tracker_layout_';

/** The layout this browser remembers for a tracker (no sort, no grouping by default). */
export const loadTrackerLayout = (key: string): TrackerLayout => {
	try {
		const raw = globalThis.localStorage?.getItem(`${LAYOUT_PREFIX}${key}`);
		const saved = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
		if (saved && typeof saved === 'object') {
			const s = saved.sort as Record<string, unknown> | null | undefined;
			const sort =
				s && typeof s.key === 'string' && (s.dir === 'asc' || s.dir === 'desc')
					? { key: s.key, dir: s.dir as TrackerSortDir }
					: null;
			const group = typeof saved.group === 'string' ? saved.group : null;
			return { sort, group };
		}
	} catch {
		// Unreadable or blocked storage: the default layout.
	}
	return { sort: null, group: null };
};

export const saveTrackerLayout = (key: string, layout: TrackerLayout): void => {
	try {
		if (!layout.sort && !layout.group) {
			globalThis.localStorage?.removeItem(`${LAYOUT_PREFIX}${key}`);
		} else {
			globalThis.localStorage?.setItem(`${LAYOUT_PREFIX}${key}`, JSON.stringify(layout));
		}
	} catch {
		// Not remembered; the tracker shows as asked anyway.
	}
};

/**
 * War-room trackers — user-created tabs of the war-room Scope.
 *
 * Steps are defined once per war room (name, colour, icon); any row of
 * any tracker carries zero, one or several of them. A tracker either
 * lists rows added by hand (`manual`: free text and / or picked
 * war-room items) or mirrors a part of the war room (its assets, IOCs,
 * customers, attached cases or registry assets), recomputed on every
 * read. Row state (steps, note, extra column values) is stored per
 * item and created on the first edit; every change is logged per row.
 *
 * A tracker can also write to the timelines (`timeline_sync`): either
 * one event per change, or one event per row kept up to date with its
 * state; dated by the change or by a date column of the tracker; sent
 * to the timeline of the case(s) of each row, or to the war-room
 * timeline. Case timelines are only written where the user has full
 * access to the case (the others are reported back), and war-room
 * events about a case item are only shown to the members who can read
 * one of its cases.
 *
 * Wraps `/api/v2/war-rooms/{id}/tracker-steps` and
 * `/api/v2/war-rooms/{id}/trackers`.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { TrackerTemplate } from './tracker-templates.service';

export type TrackerSource =
	| 'manual'
	| 'assets'
	| 'iocs'
	| 'customers'
	| 'cases'
	| 'registry_assets';

export type TrackerItemType = 'asset' | 'ioc' | 'customer' | 'case' | 'managed_asset';

export type TrackerColumnType =
	| 'text'
	| 'longtext'
	| 'number'
	| 'date'
	| 'datetime'
	| 'select'
	| 'multiselect'
	| 'checkbox'
	| 'user'
	| 'url';

export const TRACKER_MAX_COLUMNS = 20;
export const TRACKER_ROWS_LIMIT = 5000;

export const TRACKER_SOURCES: {
	value: TrackerSource;
	label: string;
	help: string;
	itemType: TrackerItemType | null;
}[] = [
	{
		value: 'manual',
		label: 'Manual',
		help: 'Rows added by hand: free text and / or picked war-room items.',
		itemType: null
	},
	{
		value: 'assets',
		label: 'Assets',
		help: 'Every asset of the attached cases.',
		itemType: 'asset'
	},
	{ value: 'iocs', label: 'IOCs', help: 'Every IOC of the attached cases.', itemType: 'ioc' },
	{
		value: 'customers',
		label: 'Customers',
		help: 'Every customer of the attached cases.',
		itemType: 'customer'
	},
	{ value: 'cases', label: 'Cases', help: 'Every attached case.', itemType: 'case' },
	{
		value: 'registry_assets',
		label: 'Registry assets',
		help: 'Assets Manager assets attached to the war room.',
		itemType: 'managed_asset'
	}
];

export const TRACKER_COLUMN_TYPES: { value: TrackerColumnType; label: string }[] = [
	{ value: 'text', label: 'Text' },
	{ value: 'longtext', label: 'Long text' },
	{ value: 'number', label: 'Number' },
	{ value: 'date', label: 'Date' },
	{ value: 'datetime', label: 'Date & time' },
	{ value: 'select', label: 'Select' },
	{ value: 'multiselect', label: 'Multi-select' },
	{ value: 'checkbox', label: 'Checkbox' },
	{ value: 'user', label: 'User' },
	{ value: 'url', label: 'URL' }
];

export const TRACKER_ITEM_TYPE_LABEL: Record<TrackerItemType, string> = {
	asset: 'Asset',
	ioc: 'IOC',
	customer: 'Customer',
	case: 'Case',
	managed_asset: 'Registry asset'
};

export interface TrackerUserRef {
	id: number;
	name: string;
}

export interface TrackerStep {
	id: number;
	name: string;
	description: string | null;
	color: string;
	icon: string | null;
	sort_order: number;
}

export interface TrackerStepInput {
	name?: string;
	description?: string | null;
	color?: string;
	icon?: string | null;
}

export interface TrackerColumn {
	key: string;
	label: string;
	type: TrackerColumnType;
	/** select / multiselect only. */
	options?: string[];
}

export type TrackerTimelineMode = 'changes' | 'state';

export type TrackerTimelineTarget = 'cases' | 'war_room';

/** `date` of a timeline sync dated by the change itself. */
export const TRACKER_TIMELINE_CHANGED_AT = 'changed_at';

export interface TrackerTimelineSync {
	mode: TrackerTimelineMode;
	target: TrackerTimelineTarget;
	/** `changed_at`, or the key of a date / datetime column. */
	date: string;
	/** War-room target: the timeline to write to; null = a "Trackers" timeline. */
	war_room_timeline_id: number | null;
}

export const TRACKER_TIMELINE_MODES: { value: TrackerTimelineMode; label: string; help: string }[] =
	[
		{
			value: 'changes',
			label: 'Every change',
			help: 'One event per change: steps set or cleared, note, columns.'
		},
		{
			value: 'state',
			label: 'Current state',
			help: 'One event per row, updated in place as its steps, note and columns change.'
		}
	];

export const TRACKER_TIMELINE_TARGETS: {
	value: TrackerTimelineTarget;
	label: string;
	help: string;
}[] = [
	{
		value: 'cases',
		label: 'Case timelines',
		help: 'The "War-room trackers" timeline of each case of the row (asset, IOC, case, customer, registry asset). Free-text rows go to the war-room timeline.'
	},
	{
		value: 'war_room',
		label: 'War-room timeline',
		help: 'Members only see the events of items from cases they can read.'
	}
];

/** What a row change wrote to the timelines. */
export interface TrackerTimelineSummary {
	events: number;
	/** Cases not written: the user has no full access to them. */
	skipped_case_ids: number[];
	/** Rows not written: the user cannot read their item. */
	restricted_rows: number;
	/** Rows without a case written to the war-room timeline (case target only). */
	war_room_rows: number;
	/** Changes mode backfill: past changes still to write (call again). */
	remaining?: number;
	/** Changes mode backfill: past changes of rows the user cannot see, left for the members who can. */
	remaining_restricted?: number;
}

export interface Tracker {
	id: number;
	war_room_id: number;
	name: string;
	icon: string | null;
	description: string | null;
	source: TrackerSource;
	/** Steps offered in this tab; null = every step of the war room. */
	step_ids: number[] | null;
	columns: TrackerColumn[];
	show_asset_flags: boolean;
	/** null = the tracker writes nothing to the timelines. */
	timeline_sync: TrackerTimelineSync | null;
	sort_order: number;
	/** Rows the caller can see. */
	row_count: number;
	/** Changes mode: past changes of the rows the caller sees not written to the timelines yet. */
	timeline_backfill?: number;
	created_by: TrackerUserRef | null;
	created_at: string | null;
	updated_at: string | null;
}

export interface TrackerCreateBody {
	name: string;
	source: TrackerSource;
	icon?: string | null;
	description?: string | null;
	step_ids?: number[] | null;
	columns?: TrackerColumn[];
	show_asset_flags?: boolean;
	timeline_sync?: TrackerTimelineSync | null;
}

/** The source cannot change once created. */
export type TrackerUpdateBody = Partial<Omit<TrackerCreateBody, 'source'>>;

/** A flag of an asset row, as listed by the scope assets endpoint. */
export interface TrackerAssetFlag {
	flag_id: number;
	name?: string;
	color?: string;
	icon?: string | null;
	reason: string | null;
	decision_id?: number | null;
	set_at: string | null;
}

export interface TrackerAssetItem {
	asset_id: number;
	asset_name: string;
	asset_type: string | null;
	case_id: number;
	case_name: string | null;
	customer_id: number | null;
	customer_name: string | null;
	compromise_status_id: number | null;
	analysis_status_id: number | null;
	flags: TrackerAssetFlag[];
}

export interface TrackerIocItem {
	ioc_id: number;
	ioc_value: string;
	ioc_type: string | null;
	case_ids: number[];
	case_names: string[];
}

export interface TrackerCustomerItem {
	customer_id: number;
	customer_name: string;
	case_count: number;
}

export interface TrackerCaseItem {
	case_id: number;
	case_name: string;
	customer_name: string | null;
	state: string | null;
}

export interface TrackerManagedAssetItem {
	managed_asset_id: number;
	name: string;
	type: string | null;
	[key: string]: unknown;
}

export type TrackerItem =
	| TrackerAssetItem
	| TrackerIocItem
	| TrackerCustomerItem
	| TrackerCaseItem
	| TrackerManagedAssetItem;

export interface TrackerRowStep {
	step_id: number;
	set_by: TrackerUserRef | null;
	set_at: string | null;
}

export type TrackerValue = string | number | boolean | string[] | null;

export interface TrackerRow {
	/** null = mirrored item without stored state yet. */
	row_id: number | null;
	/**
	 * Stable client key: `row:12` for every row of a manual tracker,
	 * `asset:44` for a mirrored item.
	 */
	key: string;
	item_type: TrackerItemType | null;
	item_id: number | null;
	/** Free-text label, or display name of the item. */
	label: string | null;
	/** Label given to an item row (null: the item's own name). */
	custom_label?: string | null;
	item: TrackerItem | null;
	/** The row points at an item the caller cannot read. */
	restricted: boolean;
	steps: TrackerRowStep[];
	note: string | null;
	values: Record<string, TrackerValue>;
	updated_at: string | null;
	updated_by: TrackerUserRef | null;
}

/** Rows returned by a change; `timeline` when the tracker writes to the timelines. */
export interface TrackerRowsResult {
	data: TrackerRow[];
	timeline?: TrackerTimelineSummary;
}

export interface TrackerRowList {
	data: TrackerRow[];
	truncated: boolean;
	limit: number;
}

/** A free-text line, or a war-room item (with an optional custom label). */
export type TrackerNewRow =
	| { label: string }
	| { item_type: TrackerItemType; item_id: number; label?: string };

export interface TrackerAddRowsBody {
	rows: TrackerNewRow[];
	/** Add an item already in the tracker again instead of skipping it. */
	allow_duplicates?: boolean;
	step_ids?: number[];
	note?: string;
}

/** A stored row, or a mirrored item (state created on the fly). */
export type TrackerRowRef = { row_id: number } | { item_type: TrackerItemType; item_id: number };

export interface TrackerStateBody {
	rows: TrackerRowRef[];
	add_step_ids?: number[];
	remove_step_ids?: number[];
	/** Replaces the set; exclusive with add / remove. */
	set_step_ids?: number[];
	note?: string | null;
	values?: Record<string, TrackerValue>;
	/** Label of a free-text row, or custom label of an item row (null resets it). */
	label?: string | null;
}

export type TrackerEventAction =
	| 'created'
	| 'deleted'
	| 'step_added'
	| 'step_removed'
	| 'note_changed'
	| 'value_changed'
	| 'label_changed';

export interface TrackerEvent {
	id: number;
	row_id: number | null;
	row_key: string | null;
	action: TrackerEventAction | string;
	details: Record<string, unknown> | null;
	user: TrackerUserRef | null;
	created_at: string | null;
}

export type TrackerHistoryQuery =
	| { row_id: number }
	| { item_type: TrackerItemType; item_id: number }
	| Record<string, never>;

export interface TrackerApplyTemplateResult {
	steps: TrackerStep[];
	trackers: Tracker[];
}

export interface TrackerSaveAsTemplateBody {
	name: string;
	description?: string | null;
	tracker_ids?: number[];
}

// --- Tabs ---------------------------------------------------------------

export const TRACKER_TAB_PREFIX = 'tracker-';

export type TrackerTabKey = `tracker-${number}`;

export const trackerTabKey = (trackerId: number): TrackerTabKey => `tracker-${trackerId}`;

/** The tracker id of a `tracker-<id>` tab, null for any other tab. */
export const trackerIdFromTab = (tab: string | null | undefined): number | null => {
	if (!tab || !tab.startsWith(TRACKER_TAB_PREFIX)) return null;
	const raw = tab.slice(TRACKER_TAB_PREFIX.length);
	if (!/^\d+$/.test(raw)) return null;
	const id = Number(raw);
	return id > 0 ? id : null;
};

// --- Helpers ------------------------------------------------------------

/** Steps in display order (sort_order, then id). */
export const sortTrackerSteps = (steps: TrackerStep[]): TrackerStep[] =>
	[...steps].sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);

/** The steps a tracker offers, in war-room order. */
export const trackerOfferedSteps = (
	tracker: Pick<Tracker, 'step_ids'>,
	steps: TrackerStep[]
): TrackerStep[] => {
	const sorted = sortTrackerSteps(steps);
	if (tracker.step_ids == null) return sorted;
	const ids = new Set(tracker.step_ids);
	return sorted.filter((s) => ids.has(s.id));
};

/**
 * How a row is addressed in a state update: the stored row first (an
 * item can have several rows), else the mirrored item.
 */
export const trackerRowRef = (
	row: Pick<TrackerRow, 'row_id' | 'item_type' | 'item_id'>
): TrackerRowRef | null => {
	if (row.row_id != null) return { row_id: row.row_id };
	if (row.item_type && row.item_id != null) {
		return { item_type: row.item_type, item_id: row.item_id };
	}
	return null;
};

/** Display name of a row: its custom label and item, or the free-text label. */
export const trackerRowLabel = (row: TrackerRow): string => {
	const name = trackerItemName(row);
	if (!row.custom_label) return name;
	return name ? `${row.custom_label} (${name})` : row.custom_label;
};

/** Name of the item of a row (the free-text label for a free-text row). */
export const trackerItemName = (row: TrackerRow): string => {
	if (row.restricted) return 'Restricted item';
	const item = row.item as Record<string, unknown> | null;
	if (item && row.item_type) {
		const name =
			row.item_type === 'asset'
				? item.asset_name
				: row.item_type === 'ioc'
					? item.ioc_value
					: row.item_type === 'customer'
						? item.customer_name
						: row.item_type === 'case'
							? item.case_name
							: item.name;
		if (typeof name === 'string' && name) return name;
	}
	if (row.label) return row.label;
	if (row.item_type && row.item_id != null) {
		return `${TRACKER_ITEM_TYPE_LABEL[row.item_type]} #${row.item_id}`;
	}
	return '';
};

/** Row count per step id, plus `none` for the rows without any step. */
export const trackerStepCounts = (
	rows: Pick<TrackerRow, 'steps'>[]
): { byStep: Map<number, number>; none: number } => {
	const byStep = new Map<number, number>();
	let none = 0;
	for (const row of rows) {
		if (row.steps.length === 0) none += 1;
		for (const s of row.steps) byStep.set(s.step_id, (byStep.get(s.step_id) ?? 0) + 1);
	}
	return { byStep, none };
};

/** Text of a value, for search and read-only display. */
export const trackerValueText = (
	value: TrackerValue | undefined,
	column?: Pick<TrackerColumn, 'type'>,
	userName?: (id: number) => string | null | undefined
): string => {
	if (value === null || value === undefined || value === '') return '';
	if (Array.isArray(value)) return value.join(', ');
	if (typeof value === 'boolean') return value ? 'Yes' : 'No';
	if (column?.type === 'user' && typeof value === 'number') {
		return userName?.(value) ?? `User #${value}`;
	}
	return String(value);
};

export interface TrackerRowFilter {
	q?: string;
	/** A step id, `'none'` for rows without any step, null for every row. */
	step?: number | 'none' | null;
}

/** Client-side filtering of the loaded rows. */
export const filterTrackerRows = (
	rows: TrackerRow[],
	filter: TrackerRowFilter,
	columns: TrackerColumn[] = []
): TrackerRow[] => {
	const q = filter.q?.trim().toLowerCase() ?? '';
	const step = filter.step ?? null;
	return rows.filter((row) => {
		if (step === 'none' && row.steps.length > 0) return false;
		if (typeof step === 'number' && !row.steps.some((s) => s.step_id === step)) return false;
		if (!q) return true;
		const item = (row.item ?? {}) as Record<string, unknown>;
		const hay = [
			trackerRowLabel(row),
			row.label ?? '',
			row.note ?? '',
			...Object.values(item).filter((v) => typeof v === 'string' || typeof v === 'number'),
			...(Array.isArray(item.case_names) ? (item.case_names as string[]) : []),
			...columns.map((c) => trackerValueText(row.values?.[c.key], c))
		]
			.join(' ')
			.toLowerCase();
		return hay.includes(q);
	});
};

/** A fresh column key: `c_<slug>` made unique among `taken`. */
export const newTrackerColumnKey = (label: string, taken: Iterable<string> = []): string => {
	const used = new Set(taken);
	const slug =
		label
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '')
			.slice(0, 24) || 'col';
	let key = `c_${slug}`;
	let n = 2;
	while (used.has(key)) key = `c_${slug}_${n++}`;
	return key;
};

/** The columns that can date timeline events. */
export const trackerTimelineDateColumns = (columns: TrackerColumn[]): TrackerColumn[] =>
	columns.filter((c) => c.type === 'date' || c.type === 'datetime');

/**
 * A timeline sync whose date column is gone (or no longer a date) falls
 * back to the change time, as the server refuses it otherwise.
 */
export const normalizeTrackerTimelineSync = <S extends Pick<TrackerTimelineSync, 'date'>>(
	sync: S | null,
	columns: TrackerColumn[]
): S | null => {
	if (!sync) return null;
	const dated = trackerTimelineDateColumns(columns).some((c) => c.key === sync.date);
	return dated || sync.date === TRACKER_TIMELINE_CHANGED_AT
		? sync
		: { ...sync, date: TRACKER_TIMELINE_CHANGED_AT };
};

/**
 * A warning about what a change could not write to the timelines, or
 * null when everything was written.
 */
export const trackerTimelineWarning = (
	summary: TrackerTimelineSummary | null | undefined
): string | null => {
	if (!summary) return null;
	const parts: string[] = [];
	const skipped = summary.skipped_case_ids.length;
	if (skipped) {
		parts.push(
			`${skipped} case timeline${skipped > 1 ? 's' : ''} not written (no full access: ${summary.skipped_case_ids
				.map((id) => `#${id}`)
				.join(', ')})`
		);
	}
	if (summary.restricted_rows) {
		parts.push(
			`${summary.restricted_rows} restricted row${summary.restricted_rows > 1 ? 's' : ''} not written`
		);
	}
	if (summary.war_room_rows) {
		parts.push(
			`${summary.war_room_rows} row${summary.war_room_rows > 1 ? 's' : ''} without a case written to the war-room timeline`
		);
	}
	const hidden = summary.remaining_restricted ?? 0;
	if (hidden) {
		parts.push(
			`${hidden} past change${hidden > 1 ? 's' : ''} of rows you cannot see left for the members who can`
		);
	}
	return parts.length ? `${parts.join('; ')}.` : null;
};

/** Toast title of a timeline sync: what was written, and what is left. */
export const trackerTimelineSyncTitle = (summary: TrackerTimelineSummary): string => {
	const written = `${summary.events} timeline ${summary.events === 1 ? 'event' : 'events'} written`;
	const left = summary.remaining ?? 0;
	return left > 0 ? `${written}, ${left} past ${left === 1 ? 'change' : 'changes'} left` : written;
};

/** Apply returned rows onto the listed ones (matched by key). */
export const mergeTrackerRows = <R extends Pick<TrackerRow, 'key'>>(
	rows: R[],
	updated: R[]
): R[] => {
	if (updated.length === 0) return rows;
	const byKey = new Map(updated.map((r) => [r.key, r]));
	return rows.map((r) => byKey.get(r.key) ?? r);
};

const stepsPath = (warRoomId: number) => `/war-rooms/${warRoomId}/tracker-steps`;
const trackersPath = (warRoomId: number) => `/war-rooms/${warRoomId}/trackers`;
const rowsPath = (warRoomId: number, trackerId: number) =>
	`${trackersPath(warRoomId)}/${trackerId}/rows`;

export class WarRoomTrackersService {
	// --- Steps --------------------------------------------------------------

	static listSteps(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerStep[]>> {
		return ApiService.get(stepsPath(warRoomId), options);
	}

	static createStep(
		warRoomId: number,
		body: TrackerStepInput & { name: string },
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerStep>> {
		return ApiService.post(stepsPath(warRoomId), body, options);
	}

	static updateStep(
		warRoomId: number,
		stepId: number,
		body: TrackerStepInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerStep>> {
		return ApiService.patch(`${stepsPath(warRoomId)}/${stepId}`, body, options);
	}

	/** Removes the step from every row and from the trackers offering it. */
	static removeStep(
		warRoomId: number,
		stepId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete(`${stepsPath(warRoomId)}/${stepId}`, options);
	}

	static reorderSteps(
		warRoomId: number,
		ids: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerStep[]>> {
		return ApiService.post(`${stepsPath(warRoomId)}/reorder`, { ids }, options);
	}

	// --- Trackers -------------------------------------------------------------

	static list(warRoomId: number, options: ApiOptions = {}): Promise<RequestResponse<Tracker[]>> {
		return ApiService.get(trackersPath(warRoomId), options);
	}

	static get(
		warRoomId: number,
		trackerId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<Tracker>> {
		return ApiService.get(`${trackersPath(warRoomId)}/${trackerId}`, options);
	}

	static create(
		warRoomId: number,
		body: TrackerCreateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Tracker>> {
		return ApiService.post(trackersPath(warRoomId), body, options);
	}

	static update(
		warRoomId: number,
		trackerId: number,
		body: TrackerUpdateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<Tracker>> {
		return ApiService.patch(`${trackersPath(warRoomId)}/${trackerId}`, body, options);
	}

	static remove(
		warRoomId: number,
		trackerId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete(`${trackersPath(warRoomId)}/${trackerId}`, options);
	}

	static reorder(
		warRoomId: number,
		ids: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<Tracker[]>> {
		return ApiService.post(`${trackersPath(warRoomId)}/reorder`, { ids }, options);
	}

	// --- Rows -----------------------------------------------------------------

	static listRows(
		warRoomId: number,
		trackerId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerRowList>> {
		return ApiService.get(rowsPath(warRoomId, trackerId), options);
	}

	/** Manual trackers only; items already present are skipped. */
	static addRows(
		warRoomId: number,
		trackerId: number,
		body: TrackerAddRowsBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerRowsResult>> {
		return ApiService.post(rowsPath(warRoomId, trackerId), body, options);
	}

	/** Bulk state change (steps, note, values, label); returns the updated rows. */
	static updateState(
		warRoomId: number,
		trackerId: number,
		body: TrackerStateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerRowsResult>> {
		return ApiService.post(`${rowsPath(warRoomId, trackerId)}/state`, body, options);
	}

	/** Manual trackers only. */
	static removeRow(
		warRoomId: number,
		trackerId: number,
		rowId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete(`${rowsPath(warRoomId, trackerId)}/${rowId}`, options);
	}

	/** Manual trackers only. */
	static reorderRows(
		warRoomId: number,
		trackerId: number,
		ids: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.post(`${rowsPath(warRoomId, trackerId)}/reorder`, { ids }, options);
	}

	/** The log of one row, or the last events of the whole tracker. */
	static history(
		warRoomId: number,
		trackerId: number,
		query: TrackerHistoryQuery = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerEvent[]>> {
		return ApiService.get(
			ApiService.withQuery(
				`${rowsPath(warRoomId, trackerId)}/history`,
				query as Record<string, unknown>
			),
			options
		);
	}

	/**
	 * Write a tracker to the timelines after the fact. State mode: the
	 * current state of the rows the user sees (creates the missing events,
	 * refreshes the others). Changes mode: the past changes of the rows the
	 * user sees not written yet, oldest first and dated at the change, up to
	 * 2000 per call (`remaining` tells what is left, `remaining_restricted`
	 * what is left for the members who see the other rows).
	 */
	static syncTimeline(
		warRoomId: number,
		trackerId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerTimelineSummary>> {
		return ApiService.post(`${trackersPath(warRoomId)}/${trackerId}/timeline/sync`, {}, options);
	}

	// --- Templates ------------------------------------------------------------

	/** Merges the template steps (by name) and creates its trackers. */
	static applyTemplate(
		warRoomId: number,
		templateId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerApplyTemplateResult>> {
		return ApiService.post(
			`${trackersPath(warRoomId)}/apply-template`,
			{ template_id: templateId },
			options
		);
	}

	static saveAsTemplate(
		warRoomId: number,
		body: TrackerSaveAsTemplateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerTemplate>> {
		return ApiService.post(`${trackersPath(warRoomId)}/save-as-template`, body, options);
	}
}

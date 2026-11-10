/**
 * Case trackers — user-created tabs of the case "Trackers" page.
 *
 * The same model as the war-room trackers, scoped to one case: steps are
 * defined once per case (name, colour, icon); any row of any tracker
 * carries zero, one or several of them. A tracker either lists rows
 * added by hand (`manual`: free text and / or picked case items) or
 * mirrors a part of the case (its assets, IOCs, tasks or evidences),
 * recomputed on every read. Row state (steps, note, extra column values)
 * is stored per item and created on the first edit; every change is
 * logged per row.
 *
 * A tracker can also write to a timeline of the case (`timeline_sync`):
 * either one event per change, or one event per row kept up to date with
 * its state; dated by the change or by a date column of the tracker.
 *
 * Wraps `/api/v2/cases/{id}/tracker-steps` and `/api/v2/cases/{id}/trackers`.
 * The generic types and helpers (steps, columns, values, history) are
 * shared with the war-room trackers.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { ExportColumn } from '$lib/utils/table-export';
import type { TrackerTemplate } from './tracker-templates.service';
import {
	trackerValueText,
	type TrackerAssetFlag,
	type TrackerColumn,
	type TrackerEvent,
	type TrackerRowFilter,
	type TrackerRowStep,
	type TrackerStep,
	type TrackerStepInput,
	type TrackerTimelineMode,
	type TrackerUserRef,
	type TrackerValue
} from './war-room-trackers.service';

export type CaseTrackerSource = 'manual' | 'assets' | 'iocs' | 'tasks' | 'evidences';

export type CaseTrackerItemType = 'asset' | 'ioc' | 'task' | 'evidence';

export const CASE_TRACKER_SOURCES: {
	value: CaseTrackerSource;
	label: string;
	help: string;
	itemType: CaseTrackerItemType | null;
}[] = [
	{
		value: 'manual',
		label: 'Manual',
		help: 'Rows added by hand: free text and / or picked case items.',
		itemType: null
	},
	{ value: 'assets', label: 'Assets', help: 'Every asset of the case.', itemType: 'asset' },
	{ value: 'iocs', label: 'IOCs', help: 'Every IOC of the case.', itemType: 'ioc' },
	{ value: 'tasks', label: 'Tasks', help: 'Every task of the case.', itemType: 'task' },
	{
		value: 'evidences',
		label: 'Evidences',
		help: 'Every evidence of the case.',
		itemType: 'evidence'
	}
];

export const CASE_TRACKER_ITEM_TYPE_LABEL: Record<CaseTrackerItemType, string> = {
	asset: 'Asset',
	ioc: 'IOC',
	task: 'Task',
	evidence: 'Evidence'
};

/** `date` of a timeline sync dated by the change itself. */
export { TRACKER_TIMELINE_CHANGED_AT } from './war-room-trackers.service';

export interface CaseTrackerTimelineSync {
	mode: TrackerTimelineMode;
	/** `changed_at`, or the key of a date / datetime column. */
	date: string;
	/** The case timeline to write to; null = a "Trackers" timeline (created if needed). */
	case_timeline_id: number | null;
}

/** What a row change wrote to the timeline. */
export interface CaseTrackerTimelineSummary {
	events: number;
	/** Changes mode backfill: past changes still to write (call again). */
	remaining?: number;
}

export interface CaseTracker {
	id: number;
	case_id: number;
	name: string;
	icon: string | null;
	description: string | null;
	source: CaseTrackerSource;
	/** Steps offered in this tab; null = every step of the case. */
	step_ids: number[] | null;
	columns: TrackerColumn[];
	show_asset_flags: boolean;
	/** null = the tracker writes nothing to the timeline. */
	timeline_sync: CaseTrackerTimelineSync | null;
	sort_order: number;
	row_count: number;
	/** Changes mode: past changes not written to the timeline yet. */
	timeline_backfill?: number;
	created_by: TrackerUserRef | null;
	created_at: string | null;
	updated_at: string | null;
}

export interface CaseTrackerCreateBody {
	name: string;
	source: CaseTrackerSource;
	icon?: string | null;
	description?: string | null;
	step_ids?: number[] | null;
	columns?: TrackerColumn[];
	show_asset_flags?: boolean;
	timeline_sync?: CaseTrackerTimelineSync | null;
}

/** The source cannot change once created. */
export type CaseTrackerUpdateBody = Partial<Omit<CaseTrackerCreateBody, 'source'>>;

export interface CaseTrackerAssetItem {
	asset_id: number;
	asset_name: string;
	asset_type: string | null;
	asset_ip: string | null;
	asset_domain: string | null;
	compromise_status_id: number | null;
	analysis_status_id: number | null;
	analysis_status_name: string | null;
	flags: TrackerAssetFlag[];
}

export interface CaseTrackerIocItem {
	ioc_id: number;
	ioc_value: string;
	ioc_type: string | null;
	tlp: string | null;
}

export interface CaseTrackerTaskItem {
	task_id: number;
	task_title: string | null;
	status_id: number | null;
	status_name: string | null;
	status_color: string | null;
	assignees: TrackerUserRef[];
	open_date: string | null;
	close_date: string | null;
}

export interface CaseTrackerEvidenceItem {
	evidence_id: number;
	filename: string | null;
	type: string | null;
	file_size: number | null;
	file_hash: string | null;
	date_added: string | null;
	acquisition_date: string | null;
}

export type CaseTrackerItem =
	| CaseTrackerAssetItem
	| CaseTrackerIocItem
	| CaseTrackerTaskItem
	| CaseTrackerEvidenceItem;

export interface CaseTrackerRow {
	/** null = mirrored item without stored state yet. */
	row_id: number | null;
	/**
	 * Stable client key: `row:12` for every row of a manual tracker,
	 * `asset:44` for a mirrored item.
	 */
	key: string;
	item_type: CaseTrackerItemType | null;
	item_id: number | null;
	/** Free-text label, or display name of the item. */
	label: string | null;
	/** Label given to an item row (null: the item's own name). */
	custom_label?: string | null;
	item: CaseTrackerItem | null;
	/** The row points at an item deleted from the case. */
	restricted: boolean;
	steps: TrackerRowStep[];
	note: string | null;
	values: Record<string, TrackerValue>;
	updated_at: string | null;
	updated_by: TrackerUserRef | null;
}

/** Rows returned by a change; `timeline` when the tracker writes to the timeline. */
export interface CaseTrackerRowsResult {
	data: CaseTrackerRow[];
	timeline?: CaseTrackerTimelineSummary;
}

export interface CaseTrackerRowList {
	data: CaseTrackerRow[];
	truncated: boolean;
	limit: number;
}

/** A free-text line, or a case item (with an optional custom label). */
export type CaseTrackerNewRow =
	| { label: string }
	| { item_type: CaseTrackerItemType; item_id: number; label?: string };

export interface CaseTrackerAddRowsBody {
	rows: CaseTrackerNewRow[];
	/** Add an item already in the tracker again instead of skipping it. */
	allow_duplicates?: boolean;
	step_ids?: number[];
	note?: string;
}

/** A stored row, or a mirrored item (state created on the fly). */
export type CaseTrackerRowRef =
	| { row_id: number }
	| { item_type: CaseTrackerItemType; item_id: number };

export interface CaseTrackerStateBody {
	rows: CaseTrackerRowRef[];
	add_step_ids?: number[];
	remove_step_ids?: number[];
	/** Replaces the set; exclusive with add / remove. */
	set_step_ids?: number[];
	note?: string | null;
	values?: Record<string, TrackerValue>;
	/** Label of a free-text row, or custom label of an item row (null resets it). */
	label?: string | null;
}

export type CaseTrackerHistoryQuery =
	| { row_id: number }
	| { item_type: CaseTrackerItemType; item_id: number }
	| Record<string, never>;

export interface CaseTrackerApplyTemplateResult {
	steps: TrackerStep[];
	trackers: CaseTracker[];
	/** Names of the template trackers of a war-room source, not created. */
	skipped: string[];
}

export interface CaseTrackerSaveAsTemplateBody {
	name: string;
	description?: string | null;
	tracker_ids?: number[];
}

// --- Helpers ------------------------------------------------------------

/**
 * How a row is addressed in a state update: the stored row first (an
 * item can have several rows), else the mirrored item.
 */
export const caseTrackerRowRef = (
	row: Pick<CaseTrackerRow, 'row_id' | 'item_type' | 'item_id'>
): CaseTrackerRowRef | null => {
	if (row.row_id != null) return { row_id: row.row_id };
	if (row.item_type && row.item_id != null) {
		return { item_type: row.item_type, item_id: row.item_id };
	}
	return null;
};

/** Display name of a row: its custom label and item, or the free-text label. */
export const caseTrackerRowLabel = (row: CaseTrackerRow): string => {
	const name = caseTrackerItemName(row);
	if (!row.custom_label) return name;
	return name ? `${row.custom_label} (${name})` : row.custom_label;
};

/** Name of the item of a row (the free-text label for a free-text row). */
export const caseTrackerItemName = (row: CaseTrackerRow): string => {
	if (row.restricted) return row.label || 'Deleted item';
	const item = row.item as Record<string, unknown> | null;
	if (item && row.item_type) {
		const name =
			row.item_type === 'asset'
				? item.asset_name
				: row.item_type === 'ioc'
					? item.ioc_value
					: row.item_type === 'task'
						? item.task_title
						: item.filename;
		if (typeof name === 'string' && name) return name;
	}
	if (row.label) return row.label;
	if (row.item_type && row.item_id != null) {
		return `${CASE_TRACKER_ITEM_TYPE_LABEL[row.item_type]} #${row.item_id}`;
	}
	return '';
};

/** Client-side filtering of the loaded rows. */
export const filterCaseTrackerRows = (
	rows: CaseTrackerRow[],
	filter: TrackerRowFilter,
	columns: TrackerColumn[] = []
): CaseTrackerRow[] => {
	const q = filter.q?.trim().toLowerCase() ?? '';
	const step = filter.step ?? null;
	return rows.filter((row) => {
		if (step === 'none' && row.steps.length > 0) return false;
		if (typeof step === 'number' && !row.steps.some((s) => s.step_id === step)) return false;
		if (!q) return true;
		const item = (row.item ?? {}) as Record<string, unknown>;
		const assignees = Array.isArray(item.assignees)
			? (item.assignees as TrackerUserRef[]).map((a) => a.name)
			: [];
		const hay = [
			caseTrackerRowLabel(row),
			row.label ?? '',
			row.note ?? '',
			...Object.values(item).filter((v) => typeof v === 'string' || typeof v === 'number'),
			...assignees,
			...columns.map((c) => trackerValueText(row.values?.[c.key], c))
		]
			.join(' ')
			.toLowerCase();
		return hay.includes(q);
	});
};

/** Toast title of a timeline sync: what was written, and what is left. */
export const caseTrackerTimelineSyncTitle = (summary: CaseTrackerTimelineSummary): string => {
	const written = `${summary.events} timeline ${summary.events === 1 ? 'event' : 'events'} written`;
	const left = summary.remaining ?? 0;
	return left > 0 ? `${written}, ${left} past ${left === 1 ? 'change' : 'changes'} left` : written;
};

/** The link to a case item, null for free text and deleted items. */
export const caseTrackerItemHref = (
	caseId: number,
	row: Pick<CaseTrackerRow, 'item_type' | 'item_id' | 'restricted'>
): string | null => {
	if (row.restricted || !row.item_type || row.item_id == null) return null;
	const segment = { asset: 'assets', ioc: 'iocs', task: 'tasks', evidence: 'evidence' }[
		row.item_type
	];
	return `/case/${caseId}/${segment}/${row.item_id}`;
};

const LIST = '; ';

const text = (value: string | number | null | undefined): string =>
	value === null || value === undefined ? '' : String(value);

/** The columns a case tracker can export (copy / CSV). */
export const caseTrackerExportColumns = (
	tracker: Pick<CaseTracker, 'columns' | 'show_asset_flags'>,
	steps: TrackerStep[],
	flagName: (flagId: number) => string,
	userName: (id: number) => string | null | undefined
): ExportColumn<CaseTrackerRow>[] => {
	const stepName = new Map(steps.map((s) => [s.id, s.name]));
	return [
		{ key: 'item', header: 'Item', getter: caseTrackerRowLabel, defaultSelected: true },
		{
			key: 'item_type',
			header: 'Item type',
			getter: (r) => (r.item_type ? CASE_TRACKER_ITEM_TYPE_LABEL[r.item_type] : 'Text')
		},
		{
			key: 'steps',
			header: 'Steps',
			getter: (r) => r.steps.map((s) => stepName.get(s.step_id) ?? `Step #${s.step_id}`).join(LIST),
			defaultSelected: true
		},
		...(tracker.show_asset_flags
			? [
					{
						key: 'flags',
						header: 'Flags',
						getter: (r: CaseTrackerRow) =>
							r.item_type === 'asset' && r.item && !r.restricted
								? (r.item as CaseTrackerAssetItem).flags.map((f) => flagName(f.flag_id)).join(LIST)
								: '',
						defaultSelected: true
					}
				]
			: []),
		...tracker.columns.map((c) => ({
			key: `col:${c.key}`,
			header: c.label,
			getter: (r: CaseTrackerRow) => trackerValueText(r.values?.[c.key], c, userName),
			defaultSelected: true
		})),
		{ key: 'note', header: 'Note', getter: (r) => text(r.note), defaultSelected: true },
		{ key: 'updated_at', header: 'Last update', getter: (r) => text(r.updated_at) },
		{ key: 'updated_by', header: 'Updated by', getter: (r) => text(r.updated_by?.name) }
	];
};

const stepsPath = (caseId: number) => `/cases/${caseId}/tracker-steps`;
const trackersPath = (caseId: number) => `/cases/${caseId}/trackers`;
const rowsPath = (caseId: number, trackerId: number) => `${trackersPath(caseId)}/${trackerId}/rows`;

export class CaseTrackersService {
	// --- Steps --------------------------------------------------------------

	static listSteps(
		caseId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerStep[]>> {
		return ApiService.get(stepsPath(caseId), options);
	}

	static createStep(
		caseId: number,
		body: TrackerStepInput & { name: string },
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerStep>> {
		return ApiService.post(stepsPath(caseId), body, options);
	}

	static updateStep(
		caseId: number,
		stepId: number,
		body: TrackerStepInput,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerStep>> {
		return ApiService.patch(`${stepsPath(caseId)}/${stepId}`, body, options);
	}

	/** Removes the step from every row and from the trackers offering it. */
	static removeStep(
		caseId: number,
		stepId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete(`${stepsPath(caseId)}/${stepId}`, options);
	}

	static reorderSteps(
		caseId: number,
		ids: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerStep[]>> {
		return ApiService.post(`${stepsPath(caseId)}/reorder`, { ids }, options);
	}

	// --- Trackers -------------------------------------------------------------

	static list(caseId: number, options: ApiOptions = {}): Promise<RequestResponse<CaseTracker[]>> {
		return ApiService.get(trackersPath(caseId), options);
	}

	static get(
		caseId: number,
		trackerId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTracker>> {
		return ApiService.get(`${trackersPath(caseId)}/${trackerId}`, options);
	}

	static create(
		caseId: number,
		body: CaseTrackerCreateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTracker>> {
		return ApiService.post(trackersPath(caseId), body, options);
	}

	static update(
		caseId: number,
		trackerId: number,
		body: CaseTrackerUpdateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTracker>> {
		return ApiService.patch(`${trackersPath(caseId)}/${trackerId}`, body, options);
	}

	static remove(
		caseId: number,
		trackerId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete(`${trackersPath(caseId)}/${trackerId}`, options);
	}

	static reorder(
		caseId: number,
		ids: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTracker[]>> {
		return ApiService.post(`${trackersPath(caseId)}/reorder`, { ids }, options);
	}

	// --- Rows -----------------------------------------------------------------

	static listRows(
		caseId: number,
		trackerId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTrackerRowList>> {
		return ApiService.get(rowsPath(caseId, trackerId), options);
	}

	/** Manual trackers only; items already present are skipped. */
	static addRows(
		caseId: number,
		trackerId: number,
		body: CaseTrackerAddRowsBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTrackerRowsResult>> {
		return ApiService.post(rowsPath(caseId, trackerId), body, options);
	}

	/** Bulk state change (steps, note, values, label); returns the updated rows. */
	static updateState(
		caseId: number,
		trackerId: number,
		body: CaseTrackerStateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTrackerRowsResult>> {
		return ApiService.post(`${rowsPath(caseId, trackerId)}/state`, body, options);
	}

	/** Manual trackers only. */
	static removeRow(
		caseId: number,
		trackerId: number,
		rowId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.delete(`${rowsPath(caseId, trackerId)}/${rowId}`, options);
	}

	/** Manual trackers only. */
	static reorderRows(
		caseId: number,
		trackerId: number,
		ids: number[],
		options: ApiOptions = {}
	): Promise<RequestResponse<null>> {
		return ApiService.post(`${rowsPath(caseId, trackerId)}/reorder`, { ids }, options);
	}

	/** The log of one row, or the last events of the whole tracker. */
	static history(
		caseId: number,
		trackerId: number,
		query: CaseTrackerHistoryQuery = {},
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerEvent[]>> {
		return ApiService.get(
			ApiService.withQuery(
				`${rowsPath(caseId, trackerId)}/history`,
				query as Record<string, unknown>
			),
			options
		);
	}

	/**
	 * Write a tracker to the timeline after the fact. State mode: the
	 * current state of the stored rows (creates the missing events,
	 * refreshes the others). Changes mode: the past changes not written
	 * yet, oldest first and dated at the change, in batches (`remaining`
	 * tells what is left).
	 */
	static syncTimeline(
		caseId: number,
		trackerId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTrackerTimelineSummary>> {
		return ApiService.post(`${trackersPath(caseId)}/${trackerId}/timeline/sync`, {}, options);
	}

	// --- Templates ------------------------------------------------------------

	/** Merges the template steps (by name) and creates its case trackers. */
	static applyTemplate(
		caseId: number,
		templateId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<CaseTrackerApplyTemplateResult>> {
		return ApiService.post(
			`${trackersPath(caseId)}/apply-template`,
			{ template_id: templateId },
			options
		);
	}

	static saveAsTemplate(
		caseId: number,
		body: CaseTrackerSaveAsTemplateBody,
		options: ApiOptions = {}
	): Promise<RequestResponse<TrackerTemplate>> {
		return ApiService.post(`${trackersPath(caseId)}/save-as-template`, body, options);
	}
}

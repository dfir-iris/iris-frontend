/**
 * War-room board: one aggregated read of every attached case's asset
 * status flags, open decisions and tasks, plus a computed "needs
 * attention" list. Cases the caller cannot read only appear as
 * `{case_id, accessible: false}`.
 *
 * What the board shows is a list of widgets set by the room's writers
 * (`/board/widgets`, the default board until they change it): the fixed
 * parts of the board (KPI tiles, flags, cases, decisions, ...) and
 * configurable widgets over the trackers, the tasks or a note. The board
 * read carries each widget with its data.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';
import type { AssetFlag, AssetFlagKind } from './asset-flags.service';
import type {
	TrackerColumnType,
	TrackerItemType,
	TrackerSource,
	TrackerStep
} from './war-room-trackers.service';

export interface WarRoomBoardKpis {
	cases: number;
	cases_accessible: number;
	assets: number;
	compromised: number;
	/** Assets carrying at least one flag. */
	flagged: number;
	done: number;
	exceptions: number;
	unflagged: number;
	decisions_open: number;
	decisions_overdue: number;
	decisions_due_24h: number;
	tasks_open: number;
	/** Open war-room tasks whose status is "In progress". */
	tasks_in_progress?: number;
	/** Open war-room tasks past their due date. */
	tasks_overdue?: number;
	// The vulnerability KPIs are omitted for callers without
	// `vulnerabilities_read` (and by older backends).
	/** Open vulnerability findings over the readable cases. */
	vulnerabilities_open?: number;
	/** Open findings whose exploitation status is `exploited`. */
	vulnerabilities_exploited_open?: number;
	/** Open findings past their remediation due date. */
	vulnerabilities_overdue?: number;
	/** Open findings of a CISA KEV-listed vulnerability. */
	vulnerabilities_kev_open?: number;
	/** Assets with at least one open finding. */
	vulnerable_assets?: number;
}

export interface WarRoomBoardVulnerabilityKpis {
	open: number;
	exploitedOpen: number;
	overdue: number;
	kevOpen: number;
	vulnerableAssets: number;
}

export interface WarRoomBoardCase {
	case_id: number;
	accessible: boolean;
	case_name?: string | null;
	customer_id?: number | null;
	customer_name?: string | null;
	state_id?: number | null;
	state_name?: string | null;
	owner_id?: number | null;
	owner_name?: string | null;
	severity_name?: string | null;
	assets_total?: number;
	assets_compromised?: number;
	/**
	 * Keyed by flag id (as a string), plus `"none"` for assets without any
	 * flag. An asset carrying several flags counts under each.
	 */
	by_flag?: Record<string, number>;
	by_kind?: Record<AssetFlagKind | 'none', number>;
	tasks_open?: number;
	tasks_in_progress?: number;
	/** Highlighted tracker steps its rows carry, in the room's step order. */
	highlights?: WarRoomBoardStepCount[];
}

export interface WarRoomBoardStepCount {
	step_id: number;
	count: number;
}

/** A tracker row listed by a `tracker_list` widget. */
export interface WarRoomBoardTrackerRow {
	/** null for a mirrored item without any state yet. */
	row_id: number | null;
	key: string;
	item_type: TrackerItemType | null;
	item_id: number | null;
	/** null when restricted. */
	label: string | null;
	/** Label given to an item row (null: the item's own name). */
	custom_label?: string | null;
	/** The caller cannot read the item of the row. */
	restricted: boolean;
	/** The steps it carries, in room order. */
	step_ids: number[];
	/** Readable cases the row belongs to. */
	case_ids: number[];
	updated_at: string | null;
}

/** An open war-room task, in-progress ones first. */
export interface WarRoomBoardTask {
	task_id: number;
	title: string;
	status: string | null;
	in_progress: boolean;
	assignee_name: string | null;
	/** Team names. */
	teams: string[];
	/** Naive UTC ISO date-time. */
	due_at: string | null;
	overdue: boolean;
	source_case_id: number | null;
	parent_task_id: number | null;
}

// --- Widgets -----------------------------------------------------------------

export type BoardWidgetZone = 'banner' | 'tile' | 'panel';
export type BoardPanelColumn = 'main' | 'side';

/** The fixed parts of the board: at most once each, their id is their type. */
export const BOARD_BUILTIN_TYPES = [
	'ai_suggestions',
	'kpi_compromised',
	'kpi_decisions',
	'kpi_exceptions',
	'kpi_tasks',
	'flags',
	'vuln_open',
	'vuln_exploited',
	'vuln_overdue',
	'vuln_kev',
	'vuln_assets',
	'cases',
	'decisions',
	'attention'
] as const;

/** Widgets the room can have any number of, each with its settings. */
export const BOARD_CONFIGURABLE_TYPES = [
	'tracker_count',
	'tracker_progress',
	'tracker_list',
	'tracker_breakdown',
	'tasks',
	'note'
] as const;

export type BoardBuiltinType = (typeof BOARD_BUILTIN_TYPES)[number];
export type BoardConfigurableType = (typeof BOARD_CONFIGURABLE_TYPES)[number];
export type BoardWidgetType = BoardBuiltinType | BoardConfigurableType;

export const BOARD_TRACKER_TYPES: readonly BoardWidgetType[] = [
	'tracker_count',
	'tracker_progress',
	'tracker_list',
	'tracker_breakdown'
];

/** Zone and default column (panels only) of each type, as the server has them. */
export const BOARD_WIDGET_PLACES: Record<
	BoardWidgetType,
	{ zone: BoardWidgetZone; column: BoardPanelColumn | null }
> = {
	ai_suggestions: { zone: 'banner', column: null },
	kpi_compromised: { zone: 'tile', column: null },
	kpi_decisions: { zone: 'tile', column: null },
	kpi_exceptions: { zone: 'tile', column: null },
	kpi_tasks: { zone: 'tile', column: null },
	flags: { zone: 'tile', column: null },
	vuln_open: { zone: 'tile', column: null },
	vuln_exploited: { zone: 'tile', column: null },
	vuln_overdue: { zone: 'tile', column: null },
	vuln_kev: { zone: 'tile', column: null },
	vuln_assets: { zone: 'tile', column: null },
	cases: { zone: 'panel', column: 'main' },
	decisions: { zone: 'panel', column: 'side' },
	attention: { zone: 'panel', column: 'side' },
	tracker_count: { zone: 'tile', column: null },
	tracker_progress: { zone: 'panel', column: 'main' },
	tracker_list: { zone: 'panel', column: 'main' },
	tracker_breakdown: { zone: 'panel', column: 'main' },
	tasks: { zone: 'panel', column: 'side' },
	note: { zone: 'panel', column: 'side' }
};

export const isBoardWidgetType = (type: unknown): type is BoardWidgetType =>
	typeof type === 'string' && Object.prototype.hasOwnProperty.call(BOARD_WIDGET_PLACES, type);

export const isBoardBuiltinType = (type: string): type is BoardBuiltinType =>
	(BOARD_BUILTIN_TYPES as readonly string[]).includes(type);

export type BoardProgressDisplay = 'bars' | 'donut' | 'funnel';

export type BoardFilterValue = string | number | boolean;

/** Keeps the rows whose column value is one of `values` (any of them for a multiselect). */
export interface BoardRowFilter {
	column_key: string;
	values: BoardFilterValue[];
}

/**
 * Settings of a widget; which keys apply depends on its type:
 *  - `cases`: `highlight_step_ids`, `tracker_ids` (null = every tracker)
 *  - `tracker_progress`: `tracker_id`, `step_ids` (null = the offered steps), `display`, `filter`
 *  - `tracker_count`: `tracker_id`, `step_ids` (empty = every row), `of_total`, `filter`
 *  - `tracker_list`: `tracker_id`, `step_ids` (empty = every row), `filter`
 *  - `tracker_breakdown`: `tracker_id`, `column_key`, `step_ids` (null = the offered steps)
 *  - `tasks`: `in_progress_only`, `team_ids` (empty = every team)
 *  - `note`: `text` (markdown)
 */
export interface BoardWidgetConfig {
	highlight_step_ids?: number[];
	tracker_ids?: number[] | null;
	tracker_id?: number;
	step_ids?: number[] | null;
	display?: BoardProgressDisplay;
	filter?: BoardRowFilter | null;
	of_total?: boolean;
	column_key?: string;
	in_progress_only?: boolean;
	team_ids?: number[];
	text?: string;
}

export interface BoardTrackerRef {
	id: number;
	name: string;
	icon: string | null;
	source: TrackerSource;
}

/** The tracker (or the breakdown column) of a widget was deleted. */
export interface BoardMissingData {
	missing: 'tracker' | 'column';
}

interface BoardTrackerDataBase {
	tracker: BoardTrackerRef;
	/** The rows are capped: the figures are a lower bound. */
	truncated: boolean;
	missing?: undefined;
}

export interface BoardProgressData extends BoardTrackerDataBase {
	rows_total: number;
	rows_without_step: number;
	steps: WarRoomBoardStepCount[];
}

export interface BoardCountData extends BoardTrackerDataBase {
	count: number;
	total: number;
}

export interface BoardListData extends BoardTrackerDataBase {
	/** At most 50 of `total`. */
	rows: WarRoomBoardTrackerRow[];
	total: number;
}

export interface BoardBreakdownGroup {
	/** An option, true / false for a checkbox, null = no value. */
	value: string | boolean | null;
	rows: number;
	/** Per step of `step_ids`. */
	counts: number[];
}

export interface BoardBreakdownData extends BoardTrackerDataBase {
	column_label: string;
	column_type: TrackerColumnType;
	step_ids: number[];
	rows_total: number;
	groups: BoardBreakdownGroup[];
}

export interface BoardTasksData {
	/** At most 50 of `total`. */
	tasks: WarRoomBoardTask[];
	total: number;
	in_progress: number;
	overdue: number;
}

export type BoardWidgetData =
	| BoardMissingData
	| BoardProgressData
	| BoardCountData
	| BoardListData
	| BoardBreakdownData
	| BoardTasksData;

export interface WarRoomBoardWidget {
	id: string;
	type: BoardWidgetType;
	/** null = the default title of the type. */
	title: string | null;
	/** Panels only. */
	column: BoardPanelColumn | null;
	config: BoardWidgetConfig;
	/**
	 * Board read only: the data of tracker and tasks widgets. Absent on a
	 * tracker widget when the caller cannot see the trackers.
	 */
	data?: BoardWidgetData;
}

/** A widget as sent to the server (an id is generated when missing). */
export type WarRoomBoardWidgetInput = Omit<WarRoomBoardWidget, 'id' | 'data'> & { id?: string };

export interface WarRoomBoardWidgets {
	widgets: WarRoomBoardWidget[];
	/** false = the default board. */
	board_customized: boolean;
}

export type WarRoomBoardAttentionType =
	| 'compromised_unflagged'
	| 'exception_without_decision'
	| 'decision_overdue'
	| 'decision_due_soon'
	| 'decision_pending_vote'
	| 'decision_pending_approval'
	| 'decision_pending_implementation'
	| 'vulnerability_exploited_open'
	| 'vulnerability_overdue';

export type WarRoomBoardSeverity = 'high' | 'medium' | 'low';

export interface WarRoomBoardAttention {
	type: WarRoomBoardAttentionType | string;
	severity: WarRoomBoardSeverity;
	label: string;
	case_id?: number | null;
	asset_id?: number | null;
	decision_id?: number | null;
	task_id?: number | null;
	/** Vulnerability items: the case finding concerned. */
	finding_id?: number | null;
}

/** An open (proposed or approved, not implemented) decision of the room. */
export interface WarRoomBoardDecision {
	decision_id: number;
	number: number;
	/** `D-<number>` */
	ref: string;
	title: string;
	status: 'proposed' | 'approved' | string;
	/** Naive UTC ISO date-time, or null when no target is set. */
	target_at: string | null;
	overdue: boolean;
	due_soon: boolean;
	pending_approvers: number;
}

export interface WarRoomBoard {
	generated_at: string | null;
	kpis: WarRoomBoardKpis;
	flags: AssetFlag[];
	cases: WarRoomBoardCase[];
	attention: WarRoomBoardAttention[];
	// Absent on servers that predate the fields.
	decisions?: WarRoomBoardDecision[];
	/** What the board shows, in the room's order. */
	widgets?: WarRoomBoardWidget[];
	board_customized?: boolean;
	/** The room's tracker steps, to name the step ids of the widgets and `highlights`. */
	tracker_steps?: TrackerStep[];
}

export interface BoardStepBar {
	step: TrackerStep;
	count: number;
	/** Share of the tracker rows, 0-100. */
	pct: number;
}

/** One bar per step of a progress widget; steps deleted since are dropped. */
export const boardStepBars = (
	data: Pick<BoardProgressData, 'steps' | 'rows_total'>,
	steps: TrackerStep[]
): BoardStepBar[] => {
	const byId = new Map(steps.map((s) => [s.id, s]));
	const out: BoardStepBar[] = [];
	for (const { step_id, count } of data.steps) {
		const step = byId.get(step_id);
		if (!step) continue;
		out.push({
			step,
			count,
			pct: data.rows_total > 0 ? Math.min(100, (count / data.rows_total) * 100) : 0
		});
	}
	return out;
};

/** A count tile's figure: `10/20` out of the total, else `10`. */
export const boardCountText = (data: Pick<BoardCountData, 'count' | 'total'>, ofTotal: boolean) =>
	ofTotal ? `${data.count}/${data.total}` : String(data.count);

/** How a breakdown group or a filter value reads. */
export const boardValueLabel = (value: BoardFilterValue | null): string => {
	if (value === null) return 'Not set';
	if (value === true) return 'Yes';
	if (value === false) return 'No';
	return String(value);
};

const shaped =
	<T extends BoardWidgetData>(key: string) =>
	(data: BoardWidgetData | undefined): T | undefined =>
		data && !('missing' in data && data.missing) && key in data ? (data as T) : undefined;

/** A widget's data of the expected shape; undefined when absent or missing. */
export const boardProgressData = shaped<BoardProgressData>('rows_without_step');
export const boardCountData = shaped<BoardCountData>('count');
export const boardListData = shaped<BoardListData>('rows');
export const boardBreakdownData = shaped<BoardBreakdownData>('groups');
export const boardTasksData = shaped<BoardTasksData>('tasks');

/** What was deleted from under a widget, if anything. */
export const boardMissing = (data: BoardWidgetData | undefined): 'tracker' | 'column' | null =>
	data && 'missing' in data && data.missing ? data.missing : null;

/**
 * Where a listed tracker row leads: its case when it belongs to exactly one
 * readable case, else the tracker tab of the scope.
 */
export const boardTrackerRowHref = (
	warRoomId: number,
	trackerId: number,
	row: Pick<WarRoomBoardTrackerRow, 'case_ids'>
): string =>
	row.case_ids.length === 1
		? `/case/${row.case_ids[0]}`
		: `/war-rooms/${warRoomId}/scope?tab=tracker-${trackerId}`;

/**
 * Cases in board order: readable before locked, cases with highlighted
 * tracker steps first (most highlighted rows first), then the most
 * compromised.
 */
export const sortBoardCases = (cases: WarRoomBoardCase[]): WarRoomBoardCase[] => {
	const highlighted = (c: WarRoomBoardCase) =>
		(c.highlights ?? []).reduce((sum, h) => sum + h.count, 0);
	return [...cases].sort((a, b) => {
		if (a.accessible !== b.accessible) return a.accessible ? -1 : 1;
		return (
			highlighted(b) - highlighted(a) ||
			(b.assets_compromised ?? 0) - (a.assets_compromised ?? 0) ||
			a.case_id - b.case_id
		);
	});
};

export interface BoardFlagCount {
	/** Flag id as a string, `'other'` (flags deleted since) or `'none'`. */
	key: string;
	label: string;
	color: string | null;
	icon: string | null;
	count: number;
	/** Share of the assets carrying it, 0-100. */
	pct: number;
}

/**
 * Turn a `by_flag` map into one row per flag: the configured flags in
 * display order, then flags deleted since folded into "Other", then the
 * assets without any flag. An asset carrying several flags counts under
 * each, so the rows are shares of `assetsTotal` and do not add up to
 * 100. Zero-count rows are dropped.
 */
export const boardFlagCounts = (
	byFlag: Record<string, number> | null | undefined,
	flags: AssetFlag[],
	assetsTotal: number
): BoardFlagCount[] => {
	if (!byFlag || assetsTotal <= 0) return [];
	const pct = (count: number) => Math.min(100, (count / assetsTotal) * 100);
	const rows: BoardFlagCount[] = [];
	const known = new Set<string>();
	for (const flag of flags) {
		const key = String(flag.id);
		known.add(key);
		const count = Number(byFlag[key]) || 0;
		if (count > 0) {
			rows.push({
				key,
				label: flag.name,
				color: flag.color,
				icon: flag.icon,
				count,
				pct: pct(count)
			});
		}
	}
	let other = 0;
	for (const [key, value] of Object.entries(byFlag)) {
		if (key !== 'none' && !known.has(key)) other += Number(value) || 0;
	}
	if (other > 0) {
		rows.push({
			key: 'other',
			label: 'Other',
			color: 'gray',
			icon: null,
			count: other,
			pct: pct(other)
		});
	}
	const none = Number(byFlag.none) || 0;
	if (none > 0) {
		rows.push({
			key: 'none',
			label: 'No flag',
			color: null,
			icon: null,
			count: none,
			pct: pct(none)
		});
	}
	return rows;
};

const VULNERABILITY_ATTENTION_TYPES: ReadonlySet<string> = new Set([
	'vulnerability_exploited_open',
	'vulnerability_overdue'
]);

/**
 * Where a vulnerability attention item leads: the Vulnerabilities tab of
 * the case asset, focused on the finding when known (the case assets list
 * when the asset is unknown). `null` for any other item.
 */
export const boardVulnerabilityHref = (
	a: Pick<WarRoomBoardAttention, 'type' | 'case_id' | 'asset_id' | 'finding_id'>
): string | null => {
	if (!VULNERABILITY_ATTENTION_TYPES.has(a.type) || a.case_id == null) return null;
	if (a.asset_id == null) return `/case/${a.case_id}/assets`;
	const base = `/case/${a.case_id}/assets/${a.asset_id}?tab=vulnerabilities`;
	return a.finding_id != null ? `${base}&finding=${a.finding_id}` : base;
};

/**
 * The vulnerability KPI row, or `null` when it must not show: the viewer
 * lacks `vulnerabilities_read`, or the backend omitted the fields.
 */
export const boardVulnerabilityKpis = (
	kpis: WarRoomBoardKpis | null | undefined,
	canRead: boolean
): WarRoomBoardVulnerabilityKpis | null => {
	if (!canRead || !kpis || kpis.vulnerabilities_open === undefined) return null;
	return {
		open: kpis.vulnerabilities_open,
		exploitedOpen: kpis.vulnerabilities_exploited_open ?? 0,
		overdue: kpis.vulnerabilities_overdue ?? 0,
		kevOpen: kpis.vulnerabilities_kev_open ?? 0,
		vulnerableAssets: kpis.vulnerable_assets ?? 0
	};
};

/**
 * Where an attention item leads for vulnerability items, honouring the
 * viewer's access: without `vulnerabilities_read` the item (should the
 * backend still send one) gets no vulnerability link.
 */
export const boardVulnerabilityHrefFor = (
	a: Pick<WarRoomBoardAttention, 'type' | 'case_id' | 'asset_id' | 'finding_id'>,
	canRead: boolean
): string | null => (canRead ? boardVulnerabilityHref(a) : null);

export class WarRoomBoardService {
	static get(warRoomId: number, options: ApiOptions = {}): Promise<RequestResponse<WarRoomBoard>> {
		return ApiService.get<WarRoomBoard>(`/war-rooms/${warRoomId}/board`, options);
	}

	static getWidgets(
		warRoomId: number,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomBoardWidgets>> {
		return ApiService.get<WarRoomBoardWidgets>(`/war-rooms/${warRoomId}/board/widgets`, options);
	}

	/** Replace the room's widgets; null goes back to the default board. */
	static setWidgets(
		warRoomId: number,
		widgets: WarRoomBoardWidgetInput[] | null,
		options: ApiOptions = {}
	): Promise<RequestResponse<WarRoomBoardWidgets>> {
		return ApiService.put<WarRoomBoardWidgets>(
			`/war-rooms/${warRoomId}/board/widgets`,
			{ widgets },
			options
		);
	}
}

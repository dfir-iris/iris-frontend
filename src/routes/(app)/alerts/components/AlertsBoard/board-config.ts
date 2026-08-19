/**
 * Shared constants for the alerts triage board.
 *
 * Kept out of the component so the page can import the grouping type
 * for its URL round-trip without pulling the board (and its Kanban
 * dependencies) into the list view's bundle.
 */

/** Which lookup the board lays its columns out by. */
export type AlertBoardGroup = 'severity' | 'status';

export const ALERT_BOARD_GROUPS: readonly AlertBoardGroup[] = ['severity', 'status'];

export const isAlertBoardGroup = (value: unknown): value is AlertBoardGroup =>
	ALERT_BOARD_GROUPS.includes(value as AlertBoardGroup);

/** Which view the alerts page renders. */
export type AlertViewMode = 'list' | 'board';

export const isAlertViewMode = (value: unknown): value is AlertViewMode =>
	value === 'list' || value === 'board';

/**
 * Statuses that take an alert out of triage. The board never shows
 * these — neither as a column nor as a card — because a closed / merged
 * / escalated alert is finished work and would only pad the columns.
 *
 * Matched by name (lower-cased) rather than by id: ids are assigned by
 * `post_init.py` in insert order and differ between deployments.
 */
export const TERMINAL_ALERT_STATUS_NAMES: readonly string[] = ['closed', 'merged', 'escalated'];

export const isTerminalStatusName = (name: string | null | undefined): boolean =>
	TERMINAL_ALERT_STATUS_NAMES.includes((name ?? '').toLowerCase().trim());

/**
 * `alerts_search` reads `alert_owner_id === -1` as "alerts with no
 * owner" (see `app/datamgmt/alerts/alerts_db.py`), mirroring the
 * `cluster_id === -1` orphan filter.
 */
export const UNASSIGNED_OWNER_ID = -1;

/**
 * Column order and dot colour, keyed by lower-cased lookup name.
 *
 * Deployments can add their own severities / statuses, so both maps are
 * a best-effort overlay: anything unknown keeps a neutral dot and sorts
 * after the seeded entries but before `Unspecified`, which always
 * trails.
 */
export const SEVERITY_RANK: Readonly<Record<string, number>> = {
	critical: 0,
	high: 10,
	medium: 20,
	low: 30,
	informational: 40,
	unspecified: 90
};

export const SEVERITY_COLOR: Readonly<Record<string, string>> = {
	critical: 'red',
	high: 'orange',
	medium: 'yellow',
	low: 'green',
	informational: 'blue',
	unspecified: 'gray'
};

export const STATUS_RANK: Readonly<Record<string, number>> = {
	new: 0,
	assigned: 10,
	'in progress': 20,
	pending: 30,
	unspecified: 90
};

export const STATUS_COLOR: Readonly<Record<string, string>> = {
	new: 'blue',
	assigned: 'purple',
	'in progress': 'orange',
	pending: 'yellow',
	unspecified: 'gray'
};

/** Rank for a lookup name, with unknown entries parked before `Unspecified`. */
export const rankOf = (ranks: Readonly<Record<string, number>>, name: string): number =>
	ranks[name.toLowerCase().trim()] ?? 50;

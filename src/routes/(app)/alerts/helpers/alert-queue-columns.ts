/**
 * Sortable columns for the alert queue.
 *
 * The case overview lets you re-order its queue by clicking a column
 * header; the alert queue only ever offered "newest / oldest". These
 * definitions give it the same affordance, over the columns the alert
 * rows actually show.
 *
 * Sorting is server-side (`order_by` + `sort` on the alert search), so
 * it stays in step with pagination instead of re-ordering one page at a
 * time.
 */

/** Column name as `GET /alerts` spells it in `order_by`. */
export type AlertSortColumn = 'severity' | 'title' | 'customer_name' | 'status' | 'event_time';

export type AlertSortDir = 'asc' | 'desc';

export type AlertSortState = { column: AlertSortColumn; dir: AlertSortDir };

export type AlertQueueColumn = {
	id: AlertSortColumn;
	label: string;
	/** Extra class, for the columns that are not laid out flush left. */
	cls: string;
	/** Direction a first click picks: dates and severity open at the top end. */
	firstDir: AlertSortDir;
};

export const ALERT_QUEUE_COLUMNS: readonly AlertQueueColumn[] = [
	{ id: 'severity', label: 'Severity', cls: 'q-col-sev', firstDir: 'desc' },
	{ id: 'title', label: 'Alert', cls: 'q-col-title', firstDir: 'asc' },
	{ id: 'customer_name', label: 'Customer', cls: 'q-col-customer', firstDir: 'asc' },
	{ id: 'status', label: 'Status', cls: 'q-col-status', firstDir: 'asc' },
	{ id: 'event_time', label: 'Event time', cls: 'q-col-time', firstDir: 'desc' }
];

export const DEFAULT_ALERT_SORT: AlertSortState = { column: 'event_time', dir: 'desc' };

const isSortColumn = (value: unknown): value is AlertSortColumn =>
	ALERT_QUEUE_COLUMNS.some((column) => column.id === value);

/**
 * Read a sort state back out of the query params, falling back to the
 * default for anything the queue does not offer — a hand-edited URL or a
 * link saved before a column was renamed shouldn't leave the queue in an
 * order it cannot draw a header arrow for.
 */
export const parseAlertSort = (column: unknown, dir: unknown): AlertSortState => ({
	column: isSortColumn(column) ? column : DEFAULT_ALERT_SORT.column,
	dir: dir === 'asc' || dir === 'desc' ? dir : DEFAULT_ALERT_SORT.dir
});

/**
 * Clicking the active column reverses it; clicking any other one switches
 * to it in whichever direction is the useful one to see first.
 */
export const toggleAlertSort = (
	current: AlertSortState,
	column: AlertSortColumn
): AlertSortState => {
	if (current.column === column) {
		return { column, dir: current.dir === 'asc' ? 'desc' : 'asc' };
	}

	const firstDir = ALERT_QUEUE_COLUMNS.find((c) => c.id === column)?.firstDir ?? 'desc';
	return { column, dir: firstDir };
};

/**
 * Caret for a column header, or '' when the column is not the one being
 * sorted on.
 *
 * Every header here is labelled with the value it sorts on rather than a
 * derived quantity, so the caret can just follow the direction — unlike
 * the case queue's "Age", which has to invert its `open_date` caret.
 */
export const alertSortArrow = (sort: AlertSortState, column: AlertSortColumn): '' | '▲' | '▼' => {
	if (sort.column !== column) return '';
	return sort.dir === 'asc' ? '▲' : '▼';
};

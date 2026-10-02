/**
 * The per-user layout of the alerts page: which view (split / list /
 * board), how the board groups its columns, how many cards a list page
 * holds, whether they open expanded, and how wide the split view's queue
 * pane was dragged.
 *
 * The URL used to be the only place these lived, and the side-bar entry
 * links to a bare `/alerts` — so every visit landed back on the split
 * view and the analyst had to toggle their way back to the one they use.
 * The layout is now remembered in the per-user `preferences` JSONB bag
 * (`PUT /manage/users/me/preferences/<key>`), next to the default *filter*
 * (`alerts_default_view`), and only fills in what the URL leaves out: a
 * shared link that names a view still opens on that view.
 */

import { DEFAULT_ITEMS_PER_PAGE } from '$lib/config/api.config';
import { UsersService } from '$lib/services/users.service';
import {
	isAlertBoardGroup,
	isAlertViewMode,
	type AlertBoardGroup,
	type AlertViewMode
} from '../components/AlertsBoard/board-config';

export const ALERTS_LAYOUT_PREF_KEY = 'alerts_layout';

export type AlertsLayout = {
	view: AlertViewMode;
	board_group: AlertBoardGroup;
	per_page: number;
	expanded: boolean;
	/** Queue pane width in px in the split view; `null` = the default. Not in the URL. */
	split_queue_width: number | null;
};

export const ALERTS_LAYOUT: AlertsLayout = {
	view: 'split',
	board_group: 'severity',
	per_page: DEFAULT_ITEMS_PER_PAGE,
	expanded: false,
	split_queue_width: null
};

/**
 * Read a stored layout back, field by field. The bag is free-form JSON,
 * so one unusable field (an older client, a hand-edited row) falls back
 * on its own rather than discarding the rest of the layout.
 */
export const parseAlertsLayout = (raw: unknown): AlertsLayout => {
	if (!raw || typeof raw !== 'object') return ALERTS_LAYOUT;

	const { view, board_group, per_page, expanded, split_queue_width } = raw as Record<
		string,
		unknown
	>;
	const perPage = Number(per_page);

	return {
		view: isAlertViewMode(view) ? view : ALERTS_LAYOUT.view,
		board_group: isAlertBoardGroup(board_group) ? board_group : ALERTS_LAYOUT.board_group,
		per_page:
			typeof per_page === 'number' && Number.isInteger(perPage) && perPage >= 1
				? perPage
				: ALERTS_LAYOUT.per_page,
		expanded: typeof expanded === 'boolean' ? expanded : ALERTS_LAYOUT.expanded,
		// Bounds are re-applied at render time against the actual window,
		// so only nonsense is rejected here.
		split_queue_width:
			typeof split_queue_width === 'number' &&
			Number.isFinite(split_queue_width) &&
			split_queue_width > 0
				? Math.round(split_queue_width)
				: ALERTS_LAYOUT.split_queue_width
	};
};

export const sameAlertsLayout = (a: AlertsLayout, b: AlertsLayout): boolean =>
	a.view === b.view &&
	a.board_group === b.board_group &&
	a.per_page === b.per_page &&
	a.expanded === b.expanded &&
	a.split_queue_width === b.split_queue_width;

/** Fetch the caller's layout. Never throws — falls back to the default. */
export const loadAlertsLayout = async (): Promise<AlertsLayout> => {
	try {
		const response = await UsersService.getMyPreference(ALERTS_LAYOUT_PREF_KEY);

		if (!response.ok || response.data === null || typeof response.data === 'string') {
			return ALERTS_LAYOUT;
		}

		return parseAlertsLayout((response.data as { value?: unknown }).value);
	} catch {
		return ALERTS_LAYOUT;
	}
};

/** Persist the caller's layout. Returns whether the write landed; never throws. */
export const saveAlertsLayout = async (layout: AlertsLayout): Promise<boolean> => {
	try {
		const response = await UsersService.setMyPreference(ALERTS_LAYOUT_PREF_KEY, {
			view: layout.view,
			board_group: layout.board_group,
			per_page: layout.per_page,
			expanded: layout.expanded,
			split_queue_width: layout.split_queue_width
		});

		return response.ok === true;
	} catch {
		return false;
	}
};

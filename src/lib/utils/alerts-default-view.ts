/**
 * The per-user default view for the alerts overview.
 *
 * Opening `/alerts` from the side bar used to land on every alert the
 * instance has ever ingested, so the first thing an analyst did on every
 * visit was re-pick the same filter. This preference names the view they
 * want instead — "all open alerts" unless they say otherwise — and the
 * alerts page applies it whenever the URL does not already carry a view
 * of its own (a bookmark, a shared link, or a cleared filter bar).
 *
 * Stored in the per-user `preferences` JSONB bag
 * (`PUT /manage/users/me/preferences/<key>`), so it follows the user
 * across browsers and needs no schema change.
 */

import { UsersService } from '$lib/services/users.service';
import type { AlertStatus } from '$lib/services/alert-status.service';

export const ALERTS_DEFAULT_VIEW_PREF_KEY = 'alerts_default_view';

export type AlertsDefaultViewMode = 'open' | 'mine' | 'unassigned' | 'all' | 'preset';

export type AlertsDefaultView = {
	mode: AlertsDefaultViewMode;
	/** Saved-filter id. Only read when `mode === 'preset'`. */
	filter_id?: number;
};

const MODES: readonly AlertsDefaultViewMode[] = ['open', 'mine', 'unassigned', 'all', 'preset'];

/**
 * What every user gets until they pick something else. "All open" is
 * the safe default: it hides finished work without hiding a colleague's
 * queue, so a fresh install still shows a newly ingested alert to
 * whoever opens the page first.
 */
export const ALERTS_DEFAULT_VIEW: AlertsDefaultView = { mode: 'open' };

/** Labels for the built-in modes, in the order the settings UI lists them. */
export const ALERTS_DEFAULT_VIEW_OPTIONS: readonly {
	mode: Exclude<AlertsDefaultViewMode, 'preset'>;
	label: string;
}[] = [
	{ mode: 'open', label: 'All open alerts' },
	{ mode: 'mine', label: 'Open alerts assigned to me' },
	{ mode: 'unassigned', label: 'Open unassigned alerts' },
	{ mode: 'all', label: 'All alerts (no filter)' }
];

/**
 * Statuses that take an alert out of triage — what "open" excludes.
 *
 * Matched by name rather than by id: ids come from `post_init.py` in
 * insert order and differ between deployments.
 */
export const TERMINAL_ALERT_STATUS_NAMES: ReadonlySet<string> = new Set([
	'closed',
	'merged',
	'dismissed',
	'escalated'
]);

/**
 * The `custom_conditions` payload that narrows a query to alerts still
 * in triage, or `undefined` when the status lookup has not loaded (or
 * names none of the terminal statuses) and there is nothing to exclude.
 */
export const openAlertsCondition = (alertStatuses: AlertStatus[]): string | undefined => {
	const terminalIds = alertStatuses
		.filter((status) => TERMINAL_ALERT_STATUS_NAMES.has((status.status_name ?? '').toLowerCase()))
		.map((status) => status.status_id);

	if (terminalIds.length === 0) return undefined;

	return JSON.stringify([{ field: 'alert_status_id', operator: 'not_in', value: terminalIds }]);
};

/**
 * Read a stored preference back into a view, tolerating anything the
 * bag might hold: it is free-form JSON, and an older client (or a hand
 * -edited row) must not be able to break the alerts page. Anything
 * unrecognised falls back to the default view.
 */
export const parseAlertsDefaultView = (raw: unknown): AlertsDefaultView => {
	if (!raw || typeof raw !== 'object') return ALERTS_DEFAULT_VIEW;

	const { mode, filter_id } = raw as { mode?: unknown; filter_id?: unknown };

	if (typeof mode !== 'string' || !MODES.includes(mode as AlertsDefaultViewMode)) {
		return ALERTS_DEFAULT_VIEW;
	}

	if (mode === 'preset') {
		const id = Number(filter_id);
		// A preset view without a usable id would resolve to nothing;
		// the open queue is a better answer than an empty page.
		if (!Number.isFinite(id)) return ALERTS_DEFAULT_VIEW;
		return { mode, filter_id: id };
	}

	return { mode: mode as AlertsDefaultViewMode };
};

/** Fetch the caller's default view. Never throws — falls back to the default. */
export const loadAlertsDefaultView = async (): Promise<AlertsDefaultView> => {
	try {
		const response = await UsersService.getMyPreference(ALERTS_DEFAULT_VIEW_PREF_KEY);

		if (!response.ok || response.data === null || typeof response.data === 'string') {
			return ALERTS_DEFAULT_VIEW;
		}

		return parseAlertsDefaultView((response.data as { value?: unknown }).value);
	} catch {
		return ALERTS_DEFAULT_VIEW;
	}
};

/** Persist the caller's default view. Returns whether the write landed. */
export const saveAlertsDefaultView = async (view: AlertsDefaultView): Promise<boolean> => {
	const payload: AlertsDefaultView =
		view.mode === 'preset' ? { mode: 'preset', filter_id: view.filter_id } : { mode: view.mode };

	const response = await UsersService.setMyPreference(ALERTS_DEFAULT_VIEW_PREF_KEY, payload);

	return response.ok === true;
};

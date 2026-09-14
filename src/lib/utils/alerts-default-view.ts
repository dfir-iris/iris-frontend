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

export const ALERTS_DEFAULT_VIEW_PREF_KEY = 'alerts_default_view';

export type AlertsDefaultViewMode = 'open' | 'mine' | 'unassigned' | 'all' | 'preset' | 'query';

export type AlertsDefaultView = {
	mode: AlertsDefaultViewMode;
	/** Saved-filter id. Only read when `mode === 'preset'`. */
	filter_id?: number;
	/** Search-bar expression. Only read when `mode === 'query'`. */
	query?: string;
};

const MODES: readonly AlertsDefaultViewMode[] = [
	'open',
	'mine',
	'unassigned',
	'all',
	'preset',
	'query'
];

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
	{ mode: 'all', label: 'All alerts (no filter)' },
	{ mode: 'query', label: 'A search expression' }
];

/**
 * The expression each built-in mode lands on.
 *
 * Written in the search grammar rather than as query parameters so the
 * landing view is a query the analyst can see in the bar and edit — and so
 * "open" and "me" are resolved by the backend, where the terminal status
 * names and the caller's identity actually live.
 */
export const ALERTS_DEFAULT_VIEW_QUERIES: Readonly<Record<'open' | 'mine' | 'unassigned', string>> =
	{
		open: 'is:open',
		mine: 'is:open owner:me',
		unassigned: 'is:open owner:none'
	};

/**
 * Read a stored preference back into a view, tolerating anything the
 * bag might hold: it is free-form JSON, and an older client (or a hand
 * -edited row) must not be able to break the alerts page. Anything
 * unrecognised falls back to the default view.
 */
export const parseAlertsDefaultView = (raw: unknown): AlertsDefaultView => {
	if (!raw || typeof raw !== 'object') return ALERTS_DEFAULT_VIEW;

	const { mode, filter_id, query } = raw as {
		mode?: unknown;
		filter_id?: unknown;
		query?: unknown;
	};

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

	if (mode === 'query') {
		// Same reasoning as `preset`: an empty expression is not a view.
		// What it *says* is not checked here — the backend is the authority
		// on the grammar, and a query this client cannot parse may simply be
		// one a newer server can.
		if (typeof query !== 'string' || query.trim() === '') return ALERTS_DEFAULT_VIEW;
		return { mode, query: query.trim() };
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
		view.mode === 'preset'
			? { mode: 'preset', filter_id: view.filter_id }
			: view.mode === 'query'
				? { mode: 'query', query: view.query }
				: { mode: view.mode };

	const response = await UsersService.setMyPreference(ALERTS_DEFAULT_VIEW_PREF_KEY, payload);

	return response.ok === true;
};

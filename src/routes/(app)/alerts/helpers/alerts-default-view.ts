import type { SavedFilter } from '$lib/services/alerts-filters.service';
import {
	ALERTS_DEFAULT_VIEW_QUERIES,
	type AlertsDefaultView
} from '$lib/utils/alerts-default-view';
import { defaultFilters, type Filters } from '../components/AlertFilters/filters';
import { savedFilterToUiFilters } from '../components/AlertFilters/saved-filters-mapper';

type DefaultViewContext = {
	/** The saved filter the `preset` view names, already fetched. */
	preset?: SavedFilter | null;
};

/**
 * Turn a stored default view into the filter set the alerts page runs.
 *
 * Every branch but `preset` lands on a search expression, so the view an
 * analyst starts from is one they can read in the bar and edit a word of —
 * rather than a set of parameters with no visible source. It also puts the
 * two resolutions that need a database or a session where they belong:
 * `is:open` names the terminal statuses server-side, and `owner:me` is
 * whoever is looking.
 *
 * Every branch degrades to something usable rather than to an empty page:
 * a preset that has since been deleted, or a `query` view saved without an
 * expression, both fall back to the widest view the branch can express.
 */
export const buildDefaultAlertFilters = (
	view: AlertsDefaultView,
	context: DefaultViewContext = {}
): Filters => {
	const base = defaultFilters();

	if (view.mode === 'all') return base;

	if (view.mode === 'preset') {
		return context.preset ? savedFilterToUiFilters(context.preset, base) : base;
	}

	if (view.mode === 'query') {
		const query = view.query?.trim();
		return query ? { ...base, query } : { ...base, query: ALERTS_DEFAULT_VIEW_QUERIES.open };
	}

	return { ...base, query: ALERTS_DEFAULT_VIEW_QUERIES[view.mode] };
};

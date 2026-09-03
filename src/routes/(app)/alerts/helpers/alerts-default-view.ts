import type { AlertStatus } from '$lib/services/alert-status.service';
import type { SavedFilter } from '$lib/services/alerts-filters.service';
import { openAlertsCondition, type AlertsDefaultView } from '$lib/utils/alerts-default-view';
import { defaultFilters, type Filters } from '../components/AlertFilters/filters';
import { savedFilterToUiFilters } from '../components/AlertFilters/saved-filters-mapper';
import { UNASSIGNED_OWNER_ID } from '../components/AlertsBoard/board-config';

type DefaultViewContext = {
	/** The status lookup, needed to name the statuses "open" excludes. */
	alertStatuses: AlertStatus[];
	/** Resolves the `mine` view. */
	currentUserId?: number | null;
	/** The saved filter the `preset` view names, already fetched. */
	preset?: SavedFilter | null;
};

/**
 * Turn a stored default view into the filter set the alerts page runs.
 *
 * Every branch degrades to something usable rather than to an empty
 * page: a preset that has since been deleted, a status lookup that
 * failed, or an unknown current user all fall back to the widest view
 * the branch can still express.
 */
export const buildDefaultAlertFilters = (
	view: AlertsDefaultView,
	context: DefaultViewContext
): Filters => {
	const base = defaultFilters();

	if (view.mode === 'all') return base;

	if (view.mode === 'preset') {
		return context.preset ? savedFilterToUiFilters(context.preset, base) : base;
	}

	const filters: Filters = {
		...base,
		custom_conditions: openAlertsCondition(context.alertStatuses)
	};

	if (view.mode === 'mine') {
		// Without a known user id "mine" cannot be expressed; the plain
		// open queue is closer to the intent than every alert at once.
		if (context.currentUserId != null) filters.alert_owner_id = context.currentUserId;
	} else if (view.mode === 'unassigned') {
		filters.alert_owner_id = UNASSIGNED_OWNER_ID;
	}

	return filters;
};

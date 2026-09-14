import type { Filters } from './filters';
import type { SavedFilter } from '$lib/services/alerts-filters.service';

type SavedAlertFilterData = {
	alert_title?: string;
	alert_description?: string;
	alert_source?: string;
	alert_tags?: string;
	alert_status_id?: number;
	alert_severity_id?: number;
	alert_classification_id?: number;
	alert_customer_id?: number;
	source_start_date?: string;
	source_end_date?: string;
	case_id?: number;
	alert_owner_id?: number;
	custom_conditions?: string;
	/**
	 * The search-bar expression. `filter_data` is free-form JSON
	 * server-side, so this needed no migration — and a preset saved before
	 * the bar existed simply has no `query`, which
	 * `savedFilterToUiFilters` reads as "clear it".
	 */
	query?: string;
	order_by?: Filters['order_by'];
	sort?: Filters['sort'];
};

const firstData = (savedFilter: SavedFilter): SavedAlertFilterData | null => {
	const raw = savedFilter.filter_data;

	if (!raw) return null;

	if (Array.isArray(raw)) {
		const savedFilterData = raw[0];
		if (savedFilterData && typeof savedFilterData === 'object') {
			return savedFilterData as SavedAlertFilterData;
		}
		return null;
	}

	if (typeof raw === 'object') return raw as SavedAlertFilterData;

	return null;
};

export const uiFiltersToSavedFilterData = (filters: Filters): SavedAlertFilterData => ({
	alert_title: filters.alert_title,
	alert_description: filters.alert_description,
	alert_source: filters.alert_source,
	alert_tags: typeof filters.alert_tags === 'string' ? filters.alert_tags : undefined,
	alert_status_id: filters.alert_status_id,
	alert_severity_id: filters.alert_severity_id,
	alert_classification_id: filters.alert_classification_id,
	alert_customer_id: filters.alert_customer_id,
	source_start_date: filters.alert_start_date,
	source_end_date: filters.alert_end_date,
	case_id: filters.case_id,
	alert_owner_id: filters.alert_owner_id,
	custom_conditions: filters.custom_conditions,
	query: filters.query,
	order_by: filters.order_by,
	sort: filters.sort
});

export const savedFilterToUiFilters = (savedFilter: SavedFilter, filters: Filters): Filters => {
	const savedFilterData = firstData(savedFilter);
	if (!savedFilterData) return filters;

	return {
		...filters,
		alert_title: savedFilterData.alert_title,
		alert_description: savedFilterData.alert_description,
		alert_source: savedFilterData.alert_source,
		alert_tags: savedFilterData.alert_tags,
		alert_status_id: savedFilterData.alert_status_id,
		alert_severity_id: savedFilterData.alert_severity_id,
		alert_classification_id: savedFilterData.alert_classification_id,
		alert_customer_id: savedFilterData.alert_customer_id,
		alert_start_date: savedFilterData.source_start_date,
		alert_end_date: savedFilterData.source_end_date,

		case_id: savedFilterData.case_id,
		alert_owner_id: savedFilterData.alert_owner_id,
		custom_conditions: savedFilterData.custom_conditions,
		// Unconditional, like every predicate above it: applying a preset
		// replaces the whole view, so a preset that carries no expression
		// has to clear the one currently in the bar rather than leave it
		// silently ANDed onto someone else's saved filter.
		query: savedFilterData.query,
		// Filters saved before the queue had sortable columns carry only a
		// direction, so the column they were sorted on falls back to
		// whatever the queue is showing now.
		order_by: savedFilterData.order_by ?? filters.order_by,
		sort: savedFilterData.sort ?? filters.sort
	};
};

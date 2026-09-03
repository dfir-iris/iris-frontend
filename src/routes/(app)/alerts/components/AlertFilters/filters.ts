import type { FilterAlertsParams } from '$lib/services/alerts.service';
import { DEFAULT_ALERT_SORT } from '../../helpers/alert-queue-columns';

/**
 * The filter subset the alerts page round-trips through the URL.
 *
 * Kept out of the barrel so plain-TypeScript consumers (the saved-filter
 * mapper, the default-view helper and their tests) can reach the type
 * and the defaults without pulling the filter components — and the rest
 * of the Svelte tree behind them — into their module graph.
 */
export type Filters = Pick<
	FilterAlertsParams,
	| 'alert_title'
	| 'alert_description'
	| 'alert_source'
	| 'alert_tags'
	| 'alert_status_id'
	| 'alert_severity_id'
	| 'alert_classification_id'
	| 'alert_customer_id'
	| 'alert_start_date'
	| 'alert_end_date'
	| 'creation_start_date'
	| 'creation_end_date'
	| 'alert_assets'
	| 'alert_iocs'
	| 'alert_ids'
	| 'source_reference'
	| 'case_id'
	| 'cluster_id'
	| 'alert_owner_id'
	| 'resolution_status_id'
	| 'custom_conditions'
	| 'sort'
	| 'order_by'
>;

export const defaultFilters = (): Filters => ({
	order_by: DEFAULT_ALERT_SORT.column,
	sort: DEFAULT_ALERT_SORT.dir
});

import type { FilterAlertsParams } from '$lib/services/alerts.service';

export { uiFiltersToSavedFilterData, savedFilterToUiFilters } from './saved-filters-mapper';
export { default as AlertFilters } from './AlertFilters.svelte';
export { default as AlertFilterLabels } from './AlertFilterLabels.svelte';
export { default as SaveAlertFiltersModal } from './SaveAlertFiltersModal.svelte';

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
	| 'alert_owner_id'
	| 'resolution_status_id'
	| 'sort'
>;

export const defaultFilters = (): Filters => ({
	sort: 'desc'
});

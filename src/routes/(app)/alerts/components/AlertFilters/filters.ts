import type { FilterAlertsParams } from '$lib/services/alerts.service';

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
	| 'case_id'
	| 'alert_owner_id'
	| 'sort'
>;

export const defaultFilters = (): Filters => ({
	sort: 'desc'
});

export const strOrUndef = (v: string): string | undefined => {
	const s = v.trim();
	return s === '' ? undefined : s;
};

export const numOrUndef = (v: string): number | undefined => {
	const s = v.trim();
	if (s === '') return undefined;
	const n = Number(s);
	return Number.isFinite(n) ? n : undefined;
};

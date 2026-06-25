/**
 * v2 service for the home-page KPI tile.
 *
 * Wraps `/api/v2/dashboard/kpis` — a compact block of numbers (assigned
 * alerts, open cases, cases closed in the last 30 days) plus the filter
 * predicate the backend used for the assigned-alerts count, so the home
 * page can deep-link into the alerts list with the exact same query.
 */
import { ApiService } from './api.service';
import type { ApiOptions, RequestResponse } from './api.service';

export interface AssignedAlertsFilter {
	alert_owner_id: number;
	alert_status_id: number[];
}

export interface DashboardKpis {
	assigned_alerts: {
		count: number;
		filter: AssignedAlertsFilter;
	};
	open_cases_count: number;
	cases_closed_last_30d: number;
}

export class DashboardService {
	static get(options?: ApiOptions): Promise<RequestResponse<DashboardKpis>> {
		return ApiService.get<DashboardKpis>('/dashboard/kpis', options);
	}
}

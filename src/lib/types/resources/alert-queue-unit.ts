import type { Alert } from './alert';
import type { AlertCluster } from './alert-cluster';

/**
 * One row of the cluster-grouped alert queue (`GET /api/v2/alerts/grouped`).
 *
 * The backend pages over *units*, not alerts: every cluster holding at
 * least one matching alert is a single unit, and every matching alert that
 * belongs to no cluster is a unit of its own. A clustered alert is
 * therefore never listed at top level — it is only reachable inside its
 * cluster — while an alert belonging to several clusters is listed under
 * each of them.
 */
export interface AlertQueueClusterUnit {
	kind: 'cluster';
	cluster: AlertCluster;
	/** Matching members only, capped by the server. */
	alerts: Alert[];
	/** How many members matched the filters, ignoring the cap. */
	alerts_total: number;
	/** True when `alerts` is shorter than `alerts_total`. */
	alerts_truncated: boolean;
}

export interface AlertQueueAlertUnit {
	kind: 'alert';
	alert: Alert;
}

export type AlertQueueUnit = AlertQueueClusterUnit | AlertQueueAlertUnit;

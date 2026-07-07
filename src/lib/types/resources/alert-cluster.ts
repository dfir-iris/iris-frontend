export interface AlertClusterStatus {
	status_id: number;
	status_name: string;
	status_description?: string | null;
}

// Free-form audit-trail dictionary keyed by unix timestamp. Matches the
// shape produced by `add_obj_history_entry` on the backend — each entry
// carries {user, user_id, action}. Kept as `Record` so consumers iterate
// with Object.entries() and sort by numeric key.
export type AlertClusterModificationHistory = Record<
	string,
	{ user: string; user_id: number; action: string }
> | null;

export interface AlertCluster {
	cluster_id: number;
	cluster_uuid: string;
	cluster_title: string;
	cluster_description?: string | null;
	cluster_status_id: number;
	cluster_severity_id?: number | null;
	cluster_customer_id: number;
	cluster_owner_id?: number | null;
	cluster_creation_time: string;
	cluster_source_rule_id?: number | null;
	cluster_case_id?: number | null;
	cluster_dedupe_key?: string | null;
	cluster_investigation_flow_id?: number | null;
	investigation_flow?: { flow_id: number; flow_name: string } | null;
	alert_ids: number[];
	status?: AlertClusterStatus;
	severity?: { severity_id: number; severity_name: string };
	customer?: { customer_id: number; customer_name: string };
	owner?: { id: number; user_name: string; user_login: string; user_email: string };
	modification_history?: AlertClusterModificationHistory;
	source_rule?: { rule_id: number; rule_name: string } | null;
}

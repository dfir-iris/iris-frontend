export interface IncidentStatus {
	status_id: number;
	status_name: string;
	status_description?: string | null;
}

export interface Incident {
	incident_id: number;
	incident_uuid: string;
	incident_title: string;
	incident_description?: string | null;
	incident_status_id: number;
	incident_severity_id?: number | null;
	incident_customer_id: number;
	incident_owner_id?: number | null;
	incident_creation_time: string;
	incident_source_rule_id?: number | null;
	incident_case_id?: number | null;
	incident_dedupe_key?: string | null;
	incident_investigation_flow_id?: number | null;
	investigation_flow?: { flow_id: number; flow_name: string } | null;
	alert_ids: number[];
	status?: IncidentStatus;
	severity?: { severity_id: number; severity_name: string };
	customer?: { customer_id: number; customer_name: string };
	owner?: { id: number; user_name: string; user_login: string; user_email: string };
}

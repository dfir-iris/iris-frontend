import type { LoginResponse } from '$lib/services/auth.service';
import type { Asset } from './asset';
import type { Classification, ResolutionStatus, Severity, Status } from './common';
import type { Customer } from './customer';
import type { Ioc } from './ioc';

export interface Alert {
	alert_id: number;
	alert_uuid: string;
	alert_title: string;
	alert_description: string;
	alert_creation_time: string;
	alert_note: string;
	alert_tags: string[];

	alert_owner_id: number;
	owner: LoginResponse;

	alert_severity_id: number;
	severity: Severity;

	alert_status_id: number;
	status: Status;

	alert_customer_id: number;
	customer: Customer;

	alert_classification_id: number;
	classification: Classification;

	alert_resolution_status_id: number;
	resolution_status: ResolutionStatus;

	assets: Asset[];

	cases: number[];
	comments: number[];

	alert_context: Record<string, string>;

	alert_source: string;
	alert_source_ref: string;
	alert_source_link: string;
	alert_source_content: Record<string, string | number>;
	alert_source_event_time: string;

	iocs: Ioc[];
}

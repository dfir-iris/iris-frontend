/** The type for a Severity field */
export interface Severity {
	severity_id: number;
	severity_name: string;
	severity_description: string;
}

/** The type for a Status field */
export interface Status {
	status_id: number;
	status_name: string;
	status_description: string;
}

/** The type for a Classification field */
export interface Classification {
	name: string;
	name_expanded: string;
	description: string;
	id: number;
	creation_date: string;
}

/** The type for a ResolutionStatus field */
export interface ResolutionStatus {
	resolution_status_id: number;
	resolution_status_name: string;
	resolution_status_description: string;
}

/** The type for custom attributes */
export interface CustomAttributes {
	[key: string]: {
		[key: string]: {
			type: string;
			mandatory: boolean;
			value: string;
		};
	};
}
